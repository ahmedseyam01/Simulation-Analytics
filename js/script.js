// =============================================================
//  Discrete Event Simulation — script.js
//  Parts 1 through 6 implemented from scratch (no frameworks)
// =============================================================

// ---------- Chart.js global defaults ----------
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#64748b';
Chart.register(ChartDataLabels);

// Keep track of chart instances so we can destroy before redrawing
let ganttChart    = null;
let waitBarChart  = null;


// =============================================================
//  1. DOM Elements / Assignment Statements
//  (All HTML elements retrieved at the top as requested)
// =============================================================

// Form Inputs
const domCustomerCount = document.getElementById('customerCount');
const domSeed          = document.getElementById('seed');
const domServerCount   = document.getElementById('serverCount');
const domDiscipline    = document.getElementById('discipline');
const domMaxQueue      = document.getElementById('maxQueue');
const domWarmup        = document.getElementById('warmup');

// Action Buttons / Form
const domSimForm       = document.getElementById('simForm');
const domResetBtn      = document.getElementById('resetBtn');

// KPI Cards
const domStatW         = document.getElementById('statW');
const domStatQ         = document.getElementById('statQ');
const domStatU         = document.getElementById('statU');
const domStatTotalTime = document.getElementById('statTotalTime');
const domStatRejected  = document.getElementById('statRejected');

// Event Log & Sequences
const domInterArrivalSeq = document.getElementById('interArrivalSeq');
const domServiceSeq      = document.getElementById('serviceSeq');
const domPerServerUtil   = document.getElementById('perServerUtil');
const domTableBody       = document.querySelector('#simTable tbody');
const domPriorityTh      = document.getElementById('priorityTh');

// Chart Canvases
const domGanttChart      = document.getElementById('ganttChart');
const domWaitingChart    = document.getElementById('waitingChart');

// Comparison Tables (Part 3: Multi-Server)
const domMsc = {
    w: { 1: document.getElementById('msc-w1'), 2: document.getElementById('msc-w2'), 3: document.getElementById('msc-w3') },
    q: { 1: document.getElementById('msc-q1'), 2: document.getElementById('msc-q2'), 3: document.getElementById('msc-q3') },
    u: { 1: document.getElementById('msc-u1'), 2: document.getElementById('msc-u2'), 3: document.getElementById('msc-u3') }
};

// Comparison Tables (Part 4: Discipline)
const domDc = {
    fcfsW: document.getElementById('dc-fcfs-w'), fcfsQ: document.getElementById('dc-fcfs-q'),
    lcfsW: document.getElementById('dc-lcfs-w'), lcfsQ: document.getElementById('dc-lcfs-q'),
    diffW: document.getElementById('dc-diff-w'), diffQ: document.getElementById('dc-diff-q')
};

// Comparison Tables (Part 5: Warm-up)
const domWuc = {
    w0: document.getElementById('wuc-w0'), w3: document.getElementById('wuc-w3'), wd: document.getElementById('wuc-wd'),
    q0: document.getElementById('wuc-q0'), q3: document.getElementById('wuc-q3'), qd: document.getElementById('wuc-qd'),
    u0: document.getElementById('wuc-u0'), u3: document.getElementById('wuc-u3'), ud: document.getElementById('wuc-ud')
};


// =============================================================
//  2. Simulation Functions
// =============================================================

const LCG_MULTIPLIER = 1664525;
const LCG_INCREMENT  = 1013904223;
const LCG_MODULUS    = 4294967296; // 2^32

/**
 * دالة لحساب الحالة التالية للرقم العشوائي (LCG)
 * تأخذ البذرة أو الحالة الحالية وتطبق عليها المعادلة الرياضية لإنتاج الحالة الجديدة
 */
function lcgNextState(currentState) {
    const nextState = Number(
        (BigInt(LCG_MULTIPLIER) * BigInt(currentState) + BigInt(LCG_INCREMENT))
        % BigInt(LCG_MODULUS)
    );
    return nextState;
}

/**
 * دالة لتحويل الحالة العشوائية الكبيرة إلى رقم صغير
 * تأخذ الحالة وتخرج رقماً صحيحاً بين 1 و 10
 */
function lcgToValue(state) {
    return (state % 10) + 1;
}

/**
 * دالة محرك المحاكاة الرئيسية
 * تقوم بتوليد البيانات العشوائية، بناء طابور الزبائن، ومحاكاة دخولهم وخروجهم من السيرفرات
 * وترجع في النهاية كل الإحصائيات (وقت الانتظار، الانشغال، أوقات الوصول)
 */
function runSimulation(config) {
    let lcgState = config.seed;           

    const interArrivalTimes = [];   
    const serviceDurations  = [];   
    const customerPriorities = [];  

    // توليد الأرقام العشوائية للزبائن
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
            id              : index + 1,
            arrivalTime     : clockAtArrival,
            serviceTime     : serviceDurations[index],
            priority        : customerPriorities[index],
            serviceStartTime  : null,
            serviceEndTime    : null,
            servedByServer    : null,
            waitTimeInQueue   : null,   
            waitTimeInSystem  : null,   
            wasRejected       : false
        };
    });

    const serverFreeAt = Array(config.numServers).fill(0);
    const busyPeriods = Array.from({ length: config.numServers }, () => []);

    let waitingQueue    = [];    
    let nextToArrive    = 0;     
    let numProcessed    = 0;     
    let clock           = 0;
    let numRejected     = 0;

    const servedCustomers = [];  

    while (numProcessed < config.numCustomers) {

        while (nextToArrive < config.numCustomers &&
               customerList[nextToArrive].arrivalTime <= clock) {

            const arrivingCustomer = customerList[nextToArrive++];

            const busyServers  = serverFreeAt.filter(freeTime => freeTime > clock).length;
            const queueIsFull  = config.maxQueueSize > 0 &&
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
            const serviceEnd   = serviceStart + chosenCustomer.serviceTime;

            chosenCustomer.serviceStartTime = serviceStart;
            chosenCustomer.serviceEndTime   = serviceEnd;
            chosenCustomer.servedByServer   = serverIndex + 1;
            chosenCustomer.waitTimeInQueue  = serviceStart - chosenCustomer.arrivalTime;
            chosenCustomer.waitTimeInSystem = serviceEnd   - chosenCustomer.arrivalTime;

            serverFreeAt[serverIndex] = serviceEnd;
            busyPeriods[serverIndex].push({
                start      : serviceStart,
                end        : serviceEnd,
                customerId : chosenCustomer.id
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
    const allCustomers      = [...servedCustomers, ...rejectedCustomers].sort((a, b) => a.id - b.id);

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

    const totalSystemWait  = customersToAnalyze.reduce((sum, c) => sum + c.waitTimeInSystem, 0);
    const avgSystemWait    = totalSystemWait / customersToAnalyze.length;

    const totalQueueWait   = customersToAnalyze.reduce((sum, c) => sum + c.waitTimeInQueue, 0);
    const avgQueueLength   = totalQueueWait / totalSimulationTime;

    const allBusyTime      = busyPeriods.flat().reduce((sum, p) => sum + (p.end - p.start), 0);
    const utilization      = (allBusyTime / (totalSimulationTime * config.numServers)) * 100;

    const perServerUtil = busyPeriods.map(periods => {
        const serverBusyTime = periods.reduce((sum, p) => sum + (p.end - p.start), 0);
        return totalSimulationTime > 0 ? ((serverBusyTime / totalSimulationTime) * 100).toFixed(1) : '0.0';
    });

    return {
        allCustomers, interArrivalTimes, serviceDurations, busyPeriods,
        numServers   : config.numServers,
        warmupCount  : config.warmupCount,
        numRejected,
        stats: {
            avgSystemWait  : avgSystemWait.toFixed(3),
            avgQueueLength : avgQueueLength.toFixed(3),
            utilization    : utilization.toFixed(1),
            perServerUtil,
            totalTime      : totalSimulationTime
        }
    };
}

/**
 * دالة لقراءة مدخلات المستخدم من عناصر الـ HTML (الفورم)
 * ترجع كائن Object يحتوي على الأرقام والخيارات المحددة
 */
function readFormConfig() {
    return {
        numCustomers  : parseInt(domCustomerCount.value) || 15,
        seed          : parseInt(domSeed.value)          || 42,
        numServers    : parseInt(domServerCount.value)   || 1,
        discipline    : domDiscipline.value,
        maxQueueSize  : parseInt(domMaxQueue.value)      || 0,
        warmupCount   : parseInt(domWarmup.value)        || 0
    };
}

/**
 * دالة لتحديث واجهة المستخدم (البطاقات، الجداول، السلاسل النصية)
 * تأخذ مخرجات المحاكاة وتطبعها في الـ DOM
 */
function updateDashboard(result) {
    const stats = result.stats;

    // تحديث كروت الإحصائيات
    domStatW.innerText         = stats.avgSystemWait;
    domStatQ.innerText         = stats.avgQueueLength;
    domStatU.innerText         = stats.utilization + '%';
    domStatTotalTime.innerText = stats.totalTime;
    domStatRejected.innerText  = result.numRejected;

    // تحديث السلاسل العشوائية المكتوبة
    domInterArrivalSeq.innerText = result.interArrivalTimes.join(', ');
    domServiceSeq.innerText      = result.serviceDurations.join(', ');

    // تحديث نسب إشغال كل سيرفر
    domPerServerUtil.innerHTML = stats.perServerUtil
        .map((util, i) => `<span class="badge bg-secondary me-1">S${i + 1}: ${util}%</span>`)
        .join('');

    // تحديث جدول الأحداث (مسح ثم ملء من جديد)
    domTableBody.innerHTML = '';
    const showPriorityColumn = domDiscipline.value === 'Priority';
    domPriorityTh.style.display = showPriorityColumn ? '' : 'none';

    result.allCustomers.forEach(customer => {
        const row = document.createElement('tr');

        if (customer.id <= result.warmupCount) row.classList.add('warmup-row');
        if (customer.wasRejected)              row.classList.add('table-danger');

        const queueWaitDisplay  = customer.wasRejected ? '—' : customer.waitTimeInQueue;
        const systemWaitDisplay = customer.wasRejected ? '—' : customer.waitTimeInSystem;
        const startDisplay      = customer.wasRejected ? '—' : customer.serviceStartTime;
        const endDisplay        = customer.wasRejected ? '—' : customer.serviceEndTime;

        const serverBadge = customer.wasRejected
            ? '<span class="badge bg-danger">Rejected</span>'
            : `<span class="badge bg-dark-soft">S${customer.servedByServer}</span>`;

        const priorityBadge = showPriorityColumn
            ? `<td><span class="badge ${
                customer.priority === 1 ? 'bg-danger' :
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
        domTableBody.appendChild(row);
    });
}


const SERVER_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

/**
 * دالة لتوجيه نداءات رسم المخططات البيانية (Gantt و Wait Chart)
 */
function drawCharts(result) {
    const servedOnly = result.allCustomers.filter(c => !c.wasRejected);
    drawGanttChart(result, servedOnly);
    drawWaitBarChart(servedOnly);
}

/**
 * دالة لرسم مخطط جانت الذي يوضح فترات عمل وتوقف كل سيرفر زمنيًا
 */
function drawGanttChart(result, servedCustomers) {
    const ctx = domGanttChart.getContext('2d');
    if (ganttChart) ganttChart.destroy();

    const serverLabels = Array.from({ length: result.numServers }, (_, i) => `Server ${i + 1}`);

    const datasets = serverLabels.map((serverLabel, serverIndex) => ({
        label           : serverLabel,
        backgroundColor : SERVER_COLORS[serverIndex] || SERVER_COLORS[0],
        borderRadius    : 6,
        barPercentage   : 0.6,
        categoryPercentage: 0.8,
        data: servedCustomers
            .filter(c => c.servedByServer === serverIndex + 1)
            .map(c => ({
                x   : [c.serviceStartTime, c.serviceEndTime],   
                y   : serverLabel,
                label: `C${c.id}`                               
            }))
    }));

    ganttChart = new Chart(ctx, { type: 'bar',
        data: { labels: serverLabels, datasets },
        options: {
            indexAxis        : 'y',
            responsive       : true,
            maintainAspectRatio: false,
            plugins: {
                legend    : { position: 'top', align: 'end' },
                datalabels: {
                    display  : true,
                    color    : '#ffffff',
                    font     : { weight: 'bold', size: 10 },
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
                    type : 'linear',
                    min  : 0,
                    title: { display: true, text: 'Simulation Time' },
                    grid : { color: '#f1f5f9' }
                },
                y: { type: 'category', labels: serverLabels }
            }
        }
    });
}

/**
 * دالة لرسم الأعمدة المكدسة التي تعرض وقت الانتظار بالإضافة لوقت الخدمة لكل زبون
 */
function drawWaitBarChart(servedCustomers) {
    const ctx = domWaitingChart.getContext('2d');
    if (waitBarChart) waitBarChart.destroy();

    const customerLabels = servedCustomers.map(c => `C${c.id}`);

    waitBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels  : customerLabels,
            datasets: [
                {label : 'Queue Wait',data : servedCustomers.map(c => c.waitTimeInQueue),backgroundColor: '#10b981',borderRadius:4},
                {label : 'Service Time',data : servedCustomers.map(c => c.serviceTime),backgroundColor: '#4f46e5',borderRadius:4}
            ]
        },
        options: {
            responsive       : true,
            maintainAspectRatio: false,
            plugins: {
                legend   : { position: 'top' },
                datalabels: {
                    display  : ctx => ctx.dataset.data[ctx.dataIndex] > 0,
                    color    : '#ffffff',
                    font     : { size: 9 }
                },
                title: {
                    display : true,
                    text    : 'System Wait per Customer  (Queue Wait + Service Time)'
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
 * دالة لمقارنة السيناريوهات المختلفة تلقائياً (تعدد السيرفرات، نوع الطابور، فترات الإحماء)
 * وتقوم بملء الجداول السفلية بنتائج المقارنات
 */
function fillComparisonTables(baseConfig) {
    // ---- Part 3: Multi-server comparison ----
    [1, 2, 3].forEach(numServers => {
        const result = runSimulation({ ...baseConfig, numServers, warmupCount: 0, discipline: 'FCFS' });
        domMsc.w[numServers].innerText = result.stats.avgSystemWait;
        domMsc.q[numServers].innerText = result.stats.avgQueueLength;
        domMsc.u[numServers].innerText = result.stats.utilization + '%';
    });

    // ---- Part 4: Discipline comparison ----
    const fcfsResult = runSimulation({ ...baseConfig, discipline: 'FCFS' });
    const lcfsResult = runSimulation({ ...baseConfig, discipline: 'LCFS' });

    domDc.fcfsW.innerText = fcfsResult.stats.avgSystemWait;
    domDc.fcfsQ.innerText = fcfsResult.stats.avgQueueLength;
    domDc.lcfsW.innerText = lcfsResult.stats.avgSystemWait;
    domDc.lcfsQ.innerText = lcfsResult.stats.avgQueueLength;

    const wDifference = (parseFloat(lcfsResult.stats.avgSystemWait)  - parseFloat(fcfsResult.stats.avgSystemWait)).toFixed(3);
    const qDifference = (parseFloat(lcfsResult.stats.avgQueueLength) - parseFloat(fcfsResult.stats.avgQueueLength)).toFixed(3);
    domDc.diffW.innerText = (wDifference >= 0 ? '+' : '') + wDifference;
    domDc.diffQ.innerText = (qDifference >= 0 ? '+' : '') + qDifference;

    // ---- Part 5: Warm-up comparison ----
    const noWarmup   = runSimulation({ ...baseConfig, warmupCount: 0 });
    const withWarmup = runSimulation({ ...baseConfig, warmupCount: 3 });

    domWuc.w0.innerText = noWarmup.stats.avgSystemWait;
    domWuc.w3.innerText = withWarmup.stats.avgSystemWait;
    domWuc.wd.innerText = (withWarmup.stats.avgSystemWait  - noWarmup.stats.avgSystemWait).toFixed(3);

    domWuc.q0.innerText = noWarmup.stats.avgQueueLength;
    domWuc.q3.innerText = withWarmup.stats.avgQueueLength;
    domWuc.qd.innerText = (withWarmup.stats.avgQueueLength - noWarmup.stats.avgQueueLength).toFixed(3);

    domWuc.u0.innerText = noWarmup.stats.utilization  + '%';
    domWuc.u3.innerText = withWarmup.stats.utilization + '%';
    domWuc.ud.innerText = (withWarmup.stats.utilization - noWarmup.stats.utilization).toFixed(1) + '%';
}

/**
 * دالة نقطة البداية الأساسية، يتم استدعاؤها عند الضغط على زر التشغيل
 * تستدعي باقي الدوال بالترتيب وتقوم بتحديث الشاشة
 */
function onFormSubmit(event) {
    if (event) event.preventDefault();

    const config = readFormConfig();
    const result = runSimulation(config);

    updateDashboard(result);
    drawCharts(result);
    fillComparisonTables(config);
}

// =============================================================
//  3. Event Listeners
// =============================================================
domSimForm.addEventListener('submit', onFormSubmit);
domResetBtn.addEventListener('click', () => location.reload());
document.addEventListener('DOMContentLoaded', () => onFormSubmit());
