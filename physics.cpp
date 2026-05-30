// Build command:
//   emcc physics.cpp -o ../public/physics.js \
//     -s MODULARIZE=1 \
//     -s EXPORT_NAME="PhysicsModule" \
//     -s EXPORTED_FUNCTIONS='["_simulate_fall","_get_frame_count","_get_frame_velocity","_get_frame_position","_get_peak_gforce","_get_impact_force","_get_survival_probability","_get_injury_class","_malloc","_free"]' \
//     -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","setValue","getValue"]' \
//     -s ALLOW_MEMORY_GROWTH=1 \
//     -O2

#include <cmath>
#include <cstdlib>
#include <cstring>
#include <ctime>

#define _USE_MATH_DEFINES
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <ctime>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

static const double GRAVITY        = 9.81;     // m/s²
static const double AIR_DENSITY    = 1.225;    // kg/m³
static const double DRAG_COEFF     = 1.0;      // human tumbling
static const double FRONTAL_AREA   = 0.7;      // m²
static const double DT             = 0.01;     // timestep seconds
static const int    MAX_FRAMES     = 20000;

struct Frame {
    double position;   // meters above ground
    double velocity;   // m/s downward (positive)
};

static Frame  g_frames[MAX_FRAMES];
static int    g_frame_count       = 0;
static double g_peak_gforce       = 0.0;
static double g_impact_force      = 0.0;
static double g_survival_prob     = 0.0;
static int    g_injury_class      = 0;   // 0=None 1=Minor 2=Moderate 3=Severe 4=Fatal

static double clamp(double v, double lo, double hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

static double randf() {
    return (double)rand() / (double)RAND_MAX;
}

// simulate_fall:
//   height_m        — drop height in metres
//   mass_kg         — body mass
//   orientation     — 0=feet-first, 1=back, 2=head, 3=tumble
//   landing_angle_deg — angle from vertical (0=straight down)
//   layers          — bubble-wrap layers (0–20)
//   bubble_strength — 0.0–1.0 (material quality)
//   wrap_tightness  — 0.0–1.0
//   monte_carlo     — 1 to add random variance
extern "C" EXPORT void simulate_fall(
    double height_m,
    double mass_kg,
    int    orientation,
    double landing_angle_deg,
    int    layers,
    double bubble_strength,
    double wrap_tightness,
    int    monte_carlo
) {
    srand((unsigned)time(nullptr));

    g_frame_count  = 0;
    g_peak_gforce  = 0.0;
    g_impact_force = 0.0;

        double angle_var    = monte_carlo ? (randf() - 0.5) * 10.0 : 0.0;
    double strength_var = monte_carlo ? (randf() - 0.5) * 0.15 : 0.0;
    double eff_angle    = clamp(landing_angle_deg + angle_var, 0.0, 85.0);
    double eff_strength = clamp(bubble_strength  + strength_var, 0.0, 1.0);

        double area_mult = 1.0;
    switch (orientation) {
        case 0: area_mult = 0.5; break;   // feet-first — minimal drag
        case 1: area_mult = 1.2; break;   // back — large area
        case 2: area_mult = 0.6; break;   // head-first
        case 3: area_mult = 1.0; break;   // tumbling
    }
    double eff_area = FRONTAL_AREA * area_mult;

        double pos = height_m;
    double vel = 0.0;

    while (pos > 0.0 && g_frame_count < MAX_FRAMES) {
        double drag = 0.5 * AIR_DENSITY * DRAG_COEFF * eff_area * vel * vel / mass_kg;
        double acc  = GRAVITY - drag;
        if (acc < 0.0) acc = 0.0;

        vel += acc * DT;
        pos -= vel * DT;
        if (pos < 0.0) pos = 0.0;

        g_frames[g_frame_count].position = pos;
        g_frames[g_frame_count].velocity = vel;
        g_frame_count++;
    }

    double impact_vel = g_frame_count > 0
        ? g_frames[g_frame_count - 1].velocity
        : 0.0;

    double base_absorb   = (double)layers * 0.04 * eff_strength * (0.7 + 0.3 * wrap_tightness);
    base_absorb          = clamp(base_absorb, 0.0, 0.75);

    double angle_bonus   = cos(eff_angle * M_PI / 180.0);
    double absorb        = base_absorb * (0.6 + 0.4 * angle_bonus);

    double post_vel      = impact_vel * sqrt(clamp(1.0 - absorb, 0.0, 1.0));

    double deform        = 0.10 + (double)layers * 0.008 * eff_strength;
    deform               = clamp(deform, 0.05, 0.60);

    double decel         = (post_vel * post_vel) / (2.0 * deform);  // m/s²
    g_impact_force       = mass_kg * decel;                          // Newtons
    g_peak_gforce        = decel / GRAVITY;

    double dv = post_vel;
    while (dv > 0.0 && g_frame_count < MAX_FRAMES) {
        dv -= (decel * DT);
        if (dv < 0.0) dv = 0.0;
        g_frames[g_frame_count].position = 0.0;
        g_frames[g_frame_count].velocity = dv;
        g_frame_count++;
    }

    double g = g_peak_gforce;
    double prob;
    if (g < 10.0)        prob = 1.00;
    else if (g < 25.0)   prob = 1.00 - (g - 10.0) / 15.0 * 0.05;
    else if (g < 50.0)   prob = 0.95 - (g - 25.0) / 25.0 * 0.20;
    else if (g < 100.0)  prob = 0.75 - (g - 50.0)  / 50.0 * 0.35;
    else if (g < 200.0)  prob = 0.40 - (g - 100.0) / 100.0 * 0.38;
    else                 prob = 0.02;

    prob += (1.0 - angle_bonus) * 0.05;
    g_survival_prob = clamp(prob, 0.0, 1.0);

        if      (g < 10.0)  g_injury_class = 0;  // None
    else if (g < 30.0)  g_injury_class = 1;  // Minor
    else if (g < 70.0)  g_injury_class = 2;  // Moderate
    else if (g < 150.0) g_injury_class = 3;  // Severe
    else                g_injury_class = 4;  // Fatal
}

extern "C" EXPORT int    get_frame_count()            { return g_frame_count; }
extern "C" EXPORT double get_frame_velocity(int i)    { return (i >= 0 && i < g_frame_count) ? g_frames[i].velocity : 0.0; }
extern "C" EXPORT double get_frame_position(int i)    { return (i >= 0 && i < g_frame_count) ? g_frames[i].position : 0.0; }
extern "C" EXPORT double get_peak_gforce()            { return g_peak_gforce; }
extern "C" EXPORT double get_impact_force()           { return g_impact_force; }
extern "C" EXPORT double get_survival_probability()   { return g_survival_prob; }
extern "C" EXPORT int    get_injury_class()           { return g_injury_class; }
