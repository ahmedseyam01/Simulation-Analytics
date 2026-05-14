========================================
 DES Simulation Dashboard — README
========================================

PROJECT: Computer System Modeling and Analysis — Lab Project
LANGUAGE: HTML + CSS + Vanilla JavaScript (no frameworks)
SIMULATION FRAMEWORK: None (built entirely from scratch)

----------------------------------------
HOW TO RUN
----------------------------------------
1. No installation or dependencies required.
2. Simply open index.html in any modern web browser
   (Chrome, Edge, Firefox, Safari — all supported).
3. Double-click index.html OR drag it into your browser window.

The simulation runs automatically on page load with default
settings (n=15, seed=42, 1 server, FCFS, no warm-up).

----------------------------------------
FILE STRUCTURE
----------------------------------------
index.html          Main dashboard page (all UI)
css/style.css       Styling (Inter font, Bootstrap 5 overrides)
js/script.js        Full simulation engine + chart rendering
README.txt          This file

External CDN libraries loaded automatically (internet required):
  - Bootstrap 5.3.0  (layout & components)
  - Chart.js         (Gantt + performance charts)
  - chartjs-plugin-datalabels 2.2.0 (bar labels)
  - Font Awesome 6.4.0 (icons)
  - Google Fonts — Inter

----------------------------------------
SIMULATION FEATURES IMPLEMENTED
----------------------------------------
Part 1 — LCG Random Number Generator
  • Formula: Xn+1 = (1664525 × Xn + 1013904223) mod 2^32
  • Scale to [1,10]: (X mod 10) + 1
  • Uses BigInt arithmetic to avoid JS float overflow
  • All values (inter-arrival, service, priority) use LCG → fully reproducible

Part 2 — Single-Server FCFS Simulation
  • Full event table: Arrival, Inter-Arr, Service, Begin, End, Q-Wait, Sys-Wait, Server
  • Computes W (avg system wait), Q (avg queue length), U (server utilization)

Part 3 — Multi-Server Simulation
  • Supports 1, 2, or 3 servers (user selectable)
  • Customers assigned to first available server
  • Per-server utilization displayed
  • Auto-generated comparison table for s = 1, 2, 3

Part 4 — Queue Discipline (LCFS implemented)
  • FCFS: shift from front of queue (default)
  • LCFS: pop from back of queue (stack behavior)
  • Priority: sort by priority level (1=highest), FCFS tiebreaker
  • Auto-generated FCFS vs LCFS comparison table

Part 5 — Warm-up Period
  • User specifies k (warm-up count)
  • First k customers run through system but excluded from stats
  • Auto-generated comparison table: k=0 vs k=3

Part 6 — Visualization
  • Gantt Chart: horizontal bars per server, customer labels, idle gaps visible
  • System Wait Chart: stacked bar (queue wait + service time) per customer

----------------------------------------
SAMPLE RUN (for report verification)
----------------------------------------
Input: n=20, seed=42, servers=1, discipline=FCFS, k=0
→ See Event Log tab for full table
→ See Gantt Timeline tab for server busy/idle chart
→ See System Wait Chart tab for per-customer wait breakdown
→ Comparison tables auto-populate at bottom of page

----------------------------------------
NOTES
----------------------------------------
• Hardcoded values are NOT used — all times come from the LCG.
• Same seed always produces identical results (reproducible).
• Max Queue Length = 0 means unlimited (default).
• Warm-up rows are shown in amber in the event table.
• Rejected customers (when max queue set) shown in red.
