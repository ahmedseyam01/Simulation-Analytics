// =============================================================
//  Discrete Event Simulation — script.js
//  Parts 1 through 6 implemented from scratch (no frameworks)
// =============================================================

// ---------- Chart.js global defaults ----------
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#64748b';
Chart.register(ChartDataLabels);

// Keep track of chart instances so we can destroy before redrawing
let ganttChart = null;
let waitBarChart = null;

const SERVER_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
const LCG_MULTIPLIER = 1664525;
const LCG_INCREMENT = 1013904223;
const LCG_MODULUS = 4294967296; // 2^32

// =============================================================
//  1. DOM Elements & Event Listeners
// =============================================================

// Form Inputs
const inputCustomerCount = document.getElementById('customerCount');
const inputSeed = document.getElementById('seed');
const inputServerCount = document.getElementById('serverCount');
const inputDiscipline = document.getElementById('discipline');
const inputMaxQueue = document.getElementById('maxQueue');
const inputWarmup = document.getElementById('warmup');

// Action Buttons / Form
const simulationForm = document.getElementById('simForm');
const resetButton = document.getElementById('resetBtn');

// KPI Cards
const kpiAvgWait = document.getElementById('statW');
const kpiAvgQueue = document.getElementById('statQ');
const kpiUtilization = document.getElementById('statU');
const kpiTotalTime = document.getElementById('statTotalTime');
const kpiRejected = document.getElementById('statRejected');

// Event Log & Sequences
const textInterArrivalSequence = document.getElementById('interArrivalSeq');
const textServiceSequence = document.getElementById('serviceSeq');
const containerPerServerUtil = document.getElementById('perServerUtil');
const eventLogTableBody = document.querySelector('#simTable tbody');
const tableHeaderPriority = document.getElementById('priorityTh');

// Chart Canvases
const canvasGanttChart = document.getElementById('ganttChart');
const canvasWaitChart = document.getElementById('waitingChart');

// Comparison Tables (Part 3: Multi-Server)
const tableMscWait1 = document.getElementById('msc-w1');
const tableMscWait2 = document.getElementById('msc-w2');
const tableMscWait3 = document.getElementById('msc-w3');

const tableMscQueue1 = document.getElementById('msc-q1');
const tableMscQueue2 = document.getElementById('msc-q2');
const tableMscQueue3 = document.getElementById('msc-q3');

const tableMscUtil1 = document.getElementById('msc-u1');
const tableMscUtil2 = document.getElementById('msc-u2');
const tableMscUtil3 = document.getElementById('msc-u3');

// Comparison Tables (Part 4: Discipline)
const tableDisciplineFcfsWait = document.getElementById('dc-fcfs-w');
const tableDisciplineFcfsQueue = document.getElementById('dc-fcfs-q');
const tableDisciplineLcfsWait = document.getElementById('dc-lcfs-w');
const tableDisciplineLcfsQueue = document.getElementById('dc-lcfs-q');
const tableDisciplineDiffWait = document.getElementById('dc-diff-w');
const tableDisciplineDiffQueue = document.getElementById('dc-diff-q');

// Comparison Tables (Part 5: Warm-up)
const tableWarmupWait0 = document.getElementById('wuc-w0');
const tableWarmupWait3 = document.getElementById('wuc-w3');
const tableWarmupWaitDiff = document.getElementById('wuc-wd');

const tableWarmupQueue0 = document.getElementById('wuc-q0');
const tableWarmupQueue3 = document.getElementById('wuc-q3');
const tableWarmupQueueDiff = document.getElementById('wuc-qd');

const tableWarmupUtil0 = document.getElementById('wuc-u0');
const tableWarmupUtil3 = document.getElementById('wuc-u3');
const tableWarmupUtilDiff = document.getElementById('wuc-ud');

// Wire up events
simulationForm.addEventListener('submit', onFormSubmit);
resetButton.addEventListener('click', () => location.reload());
// Auto-run removed to allow manual entry on first load


// =============================================================
//  2. Simulation Functions
// =============================================================

/**
 * Calculates the next state for the Linear Congruential Generator (LCG).
 * Takes the current state (seed) and applies the mathematical formula to produce the new state.
 */
function lcgNextState(currentState) {
    const nextState = Number(
        (BigInt(LCG_MULTIPLIER) * BigInt(currentState) + BigInt(LCG_INCREMENT))
        % BigInt(LCG_MODULUS)
    );
    return nextState;
}

/**
 * Converts a large random state into a smaller integer.
 * Takes the state and outputs an integer between 1 and 10.
 */
function lcgToValue(state) {
    return (state % 10) + 1;
}

/**
 * Main simulation engine function.
 * Generates random data, builds the customer queue, and simulates their arrival and departure from servers.
 * Returns all final statistics (wait times, utilization, arrival times).
 */
function runSimulation(config) {
    let lcgState = config.seed;

    const interArrivalTimes = [];
    const serviceDurations = [];
    const customerPriorities = [];

    // Generate random numbers for customers
    for (let i = 0; i < config.numCustomers; i++) {
        lcgState = lcgNextState(lcgState);
        interArrivalTimes.push(lcgToValue(lcgState));

        lcgState = lcgNextState(lcgState);
        serviceDurations.push(lcgToValue(lcgState));

        lcgState = lcgNextState(lcgState);
        customerPriorities.push((lcgState % 3) + 1);
    }

    let clockAtArrival = 0;
    const customerList = interArrivalTimes.map((gap, index) => {
        clockAtArrival += gap;
        return {
            id: index + 1,
            arrivalTime: clockAtArrival,
            serviceTime: serviceDurations[index],
            priority: customerPriorities[index],
            serviceStartTime: null,
            serviceEndTime: null,
            servedByServer: null,
            waitTimeInQueue: null,
            waitTimeInSystem: null,
            wasRejected: false
        };
    });

    const serverFreeAt = Array(config.numServers).fill(0);
    const busyPeriods = Array.from({ length: config.numServers }, () => []);

    let waitingQueue = [];
    let nextToArrive = 0;
    let numProcessed = 0;
    let clock = 0;
    let numRejected = 0;

    const servedCustomers = [];

    while (numProcessed < config.numCustomers) {

        while (nextToArrive < config.numCustomers &&
            customerList[nextToArrive].arrivalTime <= clock) {

            const arrivingCustomer = customerList[nextToArrive++];

            const busyServers = serverFreeAt.filter(freeTime => freeTime > clock).length;
            const queueIsFull = config.maxQueueSize > 0 &&
                waitingQueue.length >= config.maxQueueSize &&
                busyServers >= config.numServers;

            if (queueIsFull) {
                arrivingCustomer.wasRejected = true;
                numRejected++;
                numProcessed++;
            } else {
                waitingQueue.push(arrivingCustomer);
            }
        }

        for (let serverIndex = 0; serverIndex < config.numServers; serverIndex++) {

            const serverIsFree = serverFreeAt[serverIndex] <= clock;
            if (!serverIsFree || waitingQueue.length === 0) continue;

            let chosenCustomer;

            if (config.discipline === 'LCFS') {
                chosenCustomer = waitingQueue.pop();
            } else if (config.discipline === 'Priority') {
                waitingQueue.sort((a, b) => a.priority - b.priority || a.arrivalTime - b.arrivalTime);
                chosenCustomer = waitingQueue.shift();
            } else {
                chosenCustomer = waitingQueue.shift();
            }

            const serviceStart = Math.max(clock, chosenCustomer.arrivalTime);
            const serviceEnd = serviceStart + chosenCustomer.serviceTime;

            chosenCustomer.serviceStartTime = serviceStart;
            chosenCustomer.serviceEndTime = serviceEnd;
            chosenCustomer.servedByServer = serverIndex + 1;
            chosenCustomer.waitTimeInQueue = serviceStart - chosenCustomer.arrivalTime;
            chosenCustomer.waitTimeInSystem = serviceEnd - chosenCustomer.arrivalTime;

            serverFreeAt[serverIndex] = serviceEnd;
            busyPeriods[serverIndex].push({
                start: serviceStart,
                end: serviceEnd,
                customerId: chosenCustomer.id
            });

            servedCustomers.push(chosenCustomer);
            numProcessed++;
        }

        let nextEventTime = Infinity;

        if (nextToArrive < config.numCustomers) {
            nextEventTime = Math.min(nextEventTime, customerList[nextToArrive].arrivalTime);
        }
        for (let s = 0; s < config.numServers; s++) {
            if (serverFreeAt[s] > clock) {
                nextEventTime = Math.min(nextEventTime, serverFreeAt[s]);
            }
        }

        if (nextEventTime === Infinity) break;
        clock = nextEventTime;
    }

    servedCustomers.sort((a, b) => a.id - b.id);
    const rejectedCustomers = customerList.filter(c => c.wasRejected);
    const allCustomers = [...servedCustomers, ...rejectedCustomers].sort((a, b) => a.id - b.id);

    const totalSimulationTime = Math.max(...servedCustomers.map(c => c.serviceEndTime), 0);
    const customersToAnalyze = servedCustomers.filter(c => c.id > config.warmupCount);

    if (customersToAnalyze.length === 0) {
        return {
            allCustomers, interArrivalTimes, serviceDurations,
            busyPeriods, numServers: config.numServers,
            warmupCount: config.warmupCount, numRejected,
            stats: { avgSystemWait: 0, avgQueueLength: 0, utilization: 0, perServerUtil: [], totalTime: totalSimulationTime }
        };
    }

    const totalSystemWait = customersToAnalyze.reduce((sum, c) => sum + c.waitTimeInSystem, 0);
    const avgSystemWait = totalSystemWait / customersToAnalyze.length;

    const totalQueueWait = customersToAnalyze.reduce((sum, c) => sum + c.waitTimeInQueue, 0);
    const avgQueueLength = totalQueueWait / totalSimulationTime;

    const allBusyTime = busyPeriods.flat().reduce((sum, p) => sum + (p.end - p.start), 0);
    const utilization = (allBusyTime / (totalSimulationTime * config.numServers)) * 100;

    const perServerUtil = busyPeriods.map(periods => {
        const serverBusyTime = periods.reduce((sum, p) => sum + (p.end - p.start), 0);
        return totalSimulationTime > 0 ? ((serverBusyTime / totalSimulationTime) * 100).toFixed(1) : '0.0';
    });

    return {
        allCustomers, interArrivalTimes, serviceDurations, busyPeriods,
        numServers: config.numServers,
        warmupCount: config.warmupCount,
        numRejected,
        stats: {
            avgSystemWait: avgSystemWait.toFixed(3),
            avgQueueLength: avgQueueLength.toFixed(3),
            utilization: utilization.toFixed(1),
            perServerUtil,
            totalTime: totalSimulationTime
        }
    };
}

/**
 * Reads user inputs from HTML form elements.
 * Returns an object containing the selected numbers and options.
 */
function readFormConfig() {
    return {
        numCustomers: parseInt(inputCustomerCount.value) || 15,
        seed: parseInt(inputSeed.value) || 42,
        numServers: parseInt(inputServerCount.value) || 1,
        discipline: inputDiscipline.value,
        maxQueueSize: parseInt(inputMaxQueue.value) || 0,
        warmupCount: parseInt(inputWarmup.value) || 0
    };
}

/**
 * Updates the user interface (cards, tables, text sequences).
 * Takes the simulation output and prints it to the DOM.
 */
function updateDashboard(result) {
    const stats = result.stats;

    // Update statistics cards
    kpiAvgWait.innerText = stats.avgSystemWait;
    kpiAvgQueue.innerText = stats.avgQueueLength;
    kpiUtilization.innerText = stats.utilization + '%';
    kpiTotalTime.innerText = stats.totalTime;
    kpiRejected.innerText = result.numRejected;

    // Update randomly generated sequences text
    textInterArrivalSequence.innerText = result.interArrivalTimes.join(', ');
    textServiceSequence.innerText = result.serviceDurations.join(', ');

    // Update utilization percentage for each server
    containerPerServerUtil.innerHTML = stats.perServerUtil
        .map((util, i) => `<span class="badge bg-secondary me-1">S${i + 1}: ${util}%</span>`)
        .join('');

    // Update event log table (clear then refill)
    eventLogTableBody.innerHTML = '';
    const showPriorityColumn = inputDiscipline.value === 'Priority';
    tableHeaderPriority.style.display = showPriorityColumn ? '' : 'none';

    result.allCustomers.forEach(customer => {
        const row = document.createElement('tr');

        if (customer.id <= result.warmupCount) row.classList.add('warmup-row');
        if (customer.wasRejected) row.classList.add('table-danger');

        const queueWaitDisplay = customer.wasRejected ? '—' : customer.waitTimeInQueue;
        const systemWaitDisplay = customer.wasRejected ? '—' : customer.waitTimeInSystem;
        const startDisplay = customer.wasRejected ? '—' : customer.serviceStartTime;
        const endDisplay = customer.wasRejected ? '—' : customer.serviceEndTime;

        const serverBadge = customer.wasRejected
            ? '<span class="badge bg-danger">Rejected</span>'
            : `<span class="badge bg-dark-soft">S${customer.servedByServer}</span>`;

        const priorityBadge = showPriorityColumn
            ? `<td><span class="badge ${customer.priority === 1 ? 'bg-danger' :
                customer.priority === 2 ? 'bg-warning text-dark' : 'bg-secondary'
            }">P${customer.priority}</span></td>`
            : '';

        const hasQueueWait = !customer.wasRejected && customer.waitTimeInQueue > 0;

        row.innerHTML = `
            <td><span class="fw-bold">#${customer.id}</span></td>
            <td>${result.interArrivalTimes[customer.id - 1]}</td>
            <td>${customer.arrivalTime}</td>
            <td>${customer.serviceTime}</td>
            <td>${startDisplay}</td>
            <td>${endDisplay}</td>
            <td class="${hasQueueWait ? 'text-primary fw-bold' : 'text-muted'}">${queueWaitDisplay}</td>
            <td>${systemWaitDisplay}</td>
            <td>${serverBadge}</td>
            ${priorityBadge}
        `;
        eventLogTableBody.appendChild(row);
    });
}


/**
 * Directs calls to draw the graphical charts (Gantt and Wait Chart).
 */
function drawCharts(result) {
    const servedOnly = result.allCustomers.filter(c => !c.wasRejected);
    drawGanttChart(result, servedOnly);
    drawWaitBarChart(servedOnly);
}

/**
 * Draws a Gantt chart illustrating the active and idle periods for each server over time.
 */
function drawGanttChart(result, servedCustomers) {
    const ctx = canvasGanttChart.getContext('2d');
    if (ganttChart) ganttChart.destroy();

    const serverLabels = Array.from({ length: result.numServers }, (_, i) => `Server ${i + 1}`);

    const datasets = serverLabels.map((serverLabel, serverIndex) => ({
        label: serverLabel,
        backgroundColor: SERVER_COLORS[serverIndex] || SERVER_COLORS[0],
        borderRadius: 6,
        barPercentage: 0.6,
        categoryPercentage: 0.8,
        data: servedCustomers
            .filter(c => c.servedByServer === serverIndex + 1)
            .map(c => ({
                x: [c.serviceStartTime, c.serviceEndTime],
                y: serverLabel,
                label: `C${c.id}`
            }))
    }));

    ganttChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: serverLabels, datasets },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', align: 'end' },
                datalabels: {
                    display: true,
                    color: '#ffffff',
                    font: { weight: 'bold', size: 10 },
                    formatter: value => value.label
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const bar = ctx.raw;
                            const duration = bar.x[1] - bar.x[0];
                            return `${bar.label}: starts ${bar.x[0]}, ends ${bar.x[1]}, duration ${duration}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    title: { display: true, text: 'Simulation Time' },
                    grid: { color: '#f1f5f9' }
                },
                y: { type: 'category', labels: serverLabels }
            }
        }
    });
}

/**
 * Draws stacked bar charts showing wait time plus service time for each customer.
 */
function drawWaitBarChart(servedCustomers) {
    const ctx = canvasWaitChart.getContext('2d');
    if (waitBarChart) waitBarChart.destroy();

    const customerLabels = servedCustomers.map(c => `C${c.id}`);

    waitBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: customerLabels,
            datasets: [
                { label: 'Queue Wait', data: servedCustomers.map(c => c.waitTimeInQueue), backgroundColor: '#10b981', borderRadius: 4 },
                { label: 'Service Time', data: servedCustomers.map(c => c.serviceTime), backgroundColor: '#4f46e5', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                datalabels: {
                    display: ctx => ctx.dataset.data[ctx.dataIndex] > 0,
                    color: '#ffffff',
                    font: { size: 9 }
                },
                title: {
                    display: true,
                    text: 'System Wait per Customer  (Queue Wait + Service Time)'
                }
            },
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Time Units' } }
            }
        }
    });
}

/**
 * Automatically compares different scenarios (multi-server, queue discipline, warm-up periods)
 * and populates the bottom tables with the comparison results.
 */
function fillComparisonTables(baseConfig) {
    // ---- Part 3: Multi-server comparison ----
    const mscW = [null, tableMscWait1, tableMscWait2, tableMscWait3];
    const mscQ = [null, tableMscQueue1, tableMscQueue2, tableMscQueue3];
    const mscU = [null, tableMscUtil1, tableMscUtil2, tableMscUtil3];
    
    [1, 2, 3].forEach(numServers => {
        const result = runSimulation({ ...baseConfig, numServers, warmupCount: 0, discipline: 'FCFS' });
        mscW[numServers].innerText = result.stats.avgSystemWait;
        mscQ[numServers].innerText = result.stats.avgQueueLength;
        mscU[numServers].innerText = result.stats.utilization + '%';
    });

    // ---- Part 4: Discipline comparison ----
    const fcfsResult = runSimulation({ ...baseConfig, discipline: 'FCFS' });
    const lcfsResult = runSimulation({ ...baseConfig, discipline: 'LCFS' });

    tableDisciplineFcfsWait.innerText = fcfsResult.stats.avgSystemWait;
    tableDisciplineFcfsQueue.innerText = fcfsResult.stats.avgQueueLength;
    tableDisciplineLcfsWait.innerText = lcfsResult.stats.avgSystemWait;
    tableDisciplineLcfsQueue.innerText = lcfsResult.stats.avgQueueLength;

    const wDifference = (parseFloat(lcfsResult.stats.avgSystemWait) - parseFloat(fcfsResult.stats.avgSystemWait)).toFixed(3);
    const qDifference = (parseFloat(lcfsResult.stats.avgQueueLength) - parseFloat(fcfsResult.stats.avgQueueLength)).toFixed(3);
    tableDisciplineDiffWait.innerText = (wDifference >= 0 ? '+' : '') + wDifference;
    tableDisciplineDiffQueue.innerText = (qDifference >= 0 ? '+' : '') + qDifference;

    // ---- Part 5: Warm-up comparison ----
    const noWarmup = runSimulation({ ...baseConfig, warmupCount: 0 });
    const withWarmup = runSimulation({ ...baseConfig, warmupCount: 3 });

    tableWarmupWait0.innerText = noWarmup.stats.avgSystemWait;
    tableWarmupWait3.innerText = withWarmup.stats.avgSystemWait;
    tableWarmupWaitDiff.innerText = (withWarmup.stats.avgSystemWait - noWarmup.stats.avgSystemWait).toFixed(3);

    tableWarmupQueue0.innerText = noWarmup.stats.avgQueueLength;
    tableWarmupQueue3.innerText = withWarmup.stats.avgQueueLength;
    tableWarmupQueueDiff.innerText = (withWarmup.stats.avgQueueLength - noWarmup.stats.avgQueueLength).toFixed(3);

    tableWarmupUtil0.innerText = noWarmup.stats.utilization + '%';
    tableWarmupUtil3.innerText = withWarmup.stats.utilization + '%';
    tableWarmupUtilDiff.innerText = (withWarmup.stats.utilization - noWarmup.stats.utilization).toFixed(1) + '%';
}

/**
 * Main entry point, called when the run button is clicked.
 * Invokes the rest of the functions in order and updates the screen.
 */
function onFormSubmit(event) {
    if (event) event.preventDefault();

    const config = readFormConfig();
    const result = runSimulation(config);

    updateDashboard(result);
    drawCharts(result);
    fillComparisonTables(config);
}