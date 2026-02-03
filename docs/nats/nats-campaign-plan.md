# NATS Campaign Plan

**24-Scenario Training Progression**

---

## Phase 1: Core Mechanics (Scenarios 1-8)

*Theme: Orientation, fundamentals, guided learning with Charlie Brooks*

| Lvl | Title | Mechanics Introduced | Learning Outcomes | Primary Codes | Proficiency |
|-----|-------|---------------------|-------------------|---------------|-------------|
| 1 | First Day | UI navigation, equipment observation, alarm reading | Identify system performance indicators and availability metrics | K0740, K0741 | Remember |
| 2 | Power Sequence | Power-on sequence, equipment states, safety procedures | Execute proper equipment configuration and safety protocols | T1567, K0770 | Understand |
| 3 | Weather Event | AGC, ice accumulation, traffic handover | Monitor system performance and troubleshoot degraded conditions | T0153, S0582 | Understand |
| 4 | Link Budget Basics | Calculate C/N, IF frequency translation | Apply telecommunications principles to optimize signal quality | K0773, S0675 | Apply |
| 5 | Multi-Carrier | Spectrum management, adjacent channel interference | Configure bandwidth allocation and network parameters | K0737, K0792 | Apply |
| 6 | Step-Track LEO | Non-GEO tracking, step-track mode, inclined orbit | Operate satellite tracking equipment for non-geostationary orbits | K1032, S0421 | Apply |
| 7 | Uplink Validation | Transmit enable sequence, power verification | Test network infrastructure and verify secure communications | S0077, T1313 | Apply |
| 8 | Fault Isolation | Multiple simultaneous faults, prioritization | Diagnose connectivity problems and troubleshoot equipment failures | T0081, S0815 | Analyze |

### Scenario 1 NICE Coverage

**Primary:** K0740, K0741, T0153
**Supporting:** K0645, K0773, K1032, S0421, T0431

| Code | Count | Application |
|------|-------|-------------|
| S0421 | 6 | UI navigation to equipment panels |
| K0740 | 5 | Interpreting performance metrics (noise temp, C/N, backoff, constellation) |
| K0773 | 5 | Telecom principles (LNB, spectrum analyzer, modulation, polarization) |
| T0153 | 4 | Monitoring beacon, receiver, tracking, alarms |
| K1032 | 4 | Satellite concepts (beacon, tracking modes, polarization) |
| K0741 | 2 | Availability status (GPSDO lock, alarm dashboard) |
| T0431 | 3 | Hardware checks (GPSDO, LNB, HPA) |
| K0645 | 1 | SOP review (mission brief) |

---

## Phase 2: Independent Operations (Scenarios 9-16)

*Theme: Solo shifts, time pressure, customer interactions*

| Lvl | Title | Mechanics Combined | Challenge Type | Learning Outcomes | Primary Codes | Proficiency |
|-----|-------|-------------------|----------------|-------------------|---------------|-------------|
| 9 | Night Shift | Power sequence + alarm response | Equipment fault during off-hours | Resolve system incidents independently without supervision | T1538, S0593 | Apply |
| 10 | Customer Pass | Step-track + link budget | LEO pass with live customer data | Provide technical support while monitoring client systems | S0478, T1580 | Apply |
| 11 | Interference Hunt | Spectrum analysis + frequency calc | Unknown carrier identification | Detect signal anomalies and identify interference sources | K0926, S0648 | Apply |
| 12 | Thermal Runaway | HPA management + backoff adjustment | Equipment overheating scenario | Tune system performance and troubleshoot failing components | K0064, S0672 | Analyze |
| 13 | Handover Chain | Multi-carrier + traffic control | Sequential satellite handovers | Integrate communication systems during operational transitions | K0718, T0129 | Analyze |
| 14 | Rain Fade | AGC + link budget recalc | Adapt power during storm | Optimize link performance under degraded propagation conditions | K0689, S0675 | Analyze |
| 15 | Frequency Conflict | Uplink validation + spectrum mgmt | Resolve overlapping assignments | Assess risk and implement backup coordination procedures | K0675, T1143 | Analyze |
| 16 | Cascade Failure | Fault isolation + power sequence | Multiple sequential failures | Troubleshoot interdependent systems and recover operations | T0531, S0677 | Analyze |

---

## Phase 3: Crisis Operations (Scenarios 17-24)

*Theme: High-stakes, time-critical decisions, mentoring role*

| Lvl | Title | Mechanics Combined | Challenge Type | Learning Outcomes | Primary Codes | Proficiency |
|-----|-------|-------------------|----------------|-------------------|---------------|-------------|
| 17 | Solar Event | All RX chain + link margin | Increased noise floor from sun | Assess system threats and determine operational impacts | K0751, T1020 | Analyze |
| 18 | Satellite Anomaly | Step-track + fault isolation | Satellite station-keeping drift | Maintain infrastructure during spacecraft anomaly conditions | K1032, T1314 | Evaluate |
| 19 | Train the New Hire | Teaching mode - explain actions | Mentor new operator through power-up | Deliver technical training and produce instructional guidance | T1411, T1334 | Evaluate |
| 20 | Dual Outage | Traffic control + backup procedures | Two sites down, prioritize recovery | Implement contingency plans and coordinate multi-site recovery | T1144, S0671 | Evaluate |
| 21 | Hostile RF | Interference + uplink validation | Suspected intentional jamming | Protect network communications and identify jamming techniques | K0926, S0615 | Evaluate |
| 22 | End-of-Life Planning | Link budget + degradation trends | Satellite capacity planning | Apply risk management principles and conduct trend analysis | K0721, T1429 | Evaluate |
| 23 | Emergency Bypass | Power sequence + manual override | Automation failure, full manual ops | Execute command-line operations and diagnose hardware faults | S0424, T1588 | Evaluate |
| 24 | Constellation Crisis | All systems | Multi-sat, multi-fault, customer escalation | Solve complex problems and prepare impact assessment reports | S0807, T1606 | Create |

---

## Variation Pattern

*Challenge types are varied across phases to prevent predictability*

| Position | Phase 1 | Phase 2 | Phase 3 |
|----------|---------|---------|---------|
| +1 | Power | Fault | Solar |
| +2 | Weather | Customer | Anomaly |
| +3 | Calculate | Interference | Mentor |
| +4 | Track | Thermal | Dual site |
| +5 | Multi-carrier | Handover | Hostile |
| +6 | Transmit | Rain | Planning |
| +7 | Fault | Conflict | Manual |
| +8 | Complex | Cascade | Everything |

---

## NICE Code Reference

### Network Operations (IO-WRL-004)

- K0740: Knowledge of system performance indicators
- K0741: Knowledge of system availability measures
- K0770: Knowledge of system administration principles and practices
- K0773: Knowledge of telecommunications principles and practices
- K0737: Knowledge of bandwidth management tools and techniques
- K0792: Knowledge of network configurations
- K0718: Knowledge of network communications principles and practices
- K0689: Knowledge of network infrastructure principles and practices
- K0721: Knowledge of risk management principles and practices
- K0751: Knowledge of system threats
- K0926: Knowledge of signal jamming tools and techniques
- K1032: Knowledge of satellite-based communication systems and software
- S0077: Skill in securing network communications
- S0421: Skill in operating network equipment
- S0675: Skill in optimizing system performance
- S0815: Skill in troubleshooting network equipment
- T0081: Diagnose network connectivity problems
- T0129: Integrate new systems into existing network architecture
- T0153: Monitor network capacity and performance
- T1143: Develop network backup and recovery procedures
- T1313: Test network infrastructure, including software and hardware devices
- T1314: Maintain network infrastructure, including software and hardware devices

### System Administration (IO-WRL-005)

- K0064: Knowledge of performance tuning tools and techniques
- S0582: Skill in troubleshooting system performance
- S0593: Skill in handling incidents
- S0672: Skill in troubleshooting failed system components
- S0677: Skill in recovering failed systems
- S0424: Skill in executing command line tools
- S0671: Skill in implementing network infrastructure contingency and recovery plans
- T1567: Configure system hardware, software, and peripheral equipment
- T1538: Resolve customer-reported system incidents and events
- T1588: Diagnose faulty system and server hardware

### Technical Support (IO-WRL-007)

- S0478: Skill in providing customer support
- T1580: Monitor client-level computer system performance

### Systems Testing and Evaluation (DD-WRL-007)

- T0531: Troubleshoot hardware/software interface and interoperability problems
- T1020: Determine the operational and safety impacts of cybersecurity lapses

### Data Analysis (IO-WRL-001)

- S0648: Skill in detecting anomalies
- T1429: Prepare trend analysis reports

### Cross-Cutting

- S0615: Skill in protecting a network against malware
- S0807: Skill in solving problems
- T1144: Implement network backup and recovery procedures
- T1334: Produce cybersecurity instructional materials
- T1411: Deliver technical training to customers
- T1606: Prepare impact reports
