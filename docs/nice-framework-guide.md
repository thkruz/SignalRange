# NICE Code Mapping Guide for SignalRange Scenarios

**Version:** 1.0
**Last Updated:** January 2026
**Purpose:** Definitive reference for consistent NICE code assignment across all SignalRange scenarios

---

## Core Principles

1. **Comprehensive assignment:** 2-4 codes per objective when legitimately applicable
2. **Task-driven:** Codes match what the objective actually requires, not the scenario's proficiency level
3. **Accuracy over coverage:** Never force a code; flag gaps instead
4. **Multi-role support:** Pull from any applicable work role (Network Ops, Sys Admin, Tech Support, etc.)
5. **Condition-based:** Map codes to what the objective's conditions actually test (action, quiz, or both)

---

## Assignment Process

For each objective:

1. Read the `conditions` array - what is the student actually doing/answering?
2. Assign S-codes for skills being performed (operating, configuring, troubleshooting)
3. Assign T-codes for tasks being executed (monitoring, diagnosing, testing)
4. Assign K-codes for knowledge being demonstrated (interpreting metrics, understanding concepts)
5. Write 1-2 line comment explaining the mapping rationale

---

## Condition Type Defaults

| Condition Type | Default Codes | Rationale |
|----------------|---------------|-----------|
| `ground-station-selected` | S0421 | Operating equipment interface |
| `tab-active` | S0421 | Navigating equipment panels |
| `equipment-powered` | T0431 | Checking hardware availability |
| `status-check` (quiz) | K-codes based on question content | Knowledge demonstration |
| `signal-detected` | T0153 | Monitoring performance |
| `mission-brief-opened` | K0645 | SOP familiarity |

---

## Code Selection Rules

### T0431 vs T0153

- **T0431** (check hardware): Is it on? Is it in the right state? Is it available?
- **T0153** (monitor performance): What are the metrics? Is quality good?
- **Include both** when objective checks state AND requires interpreting metrics

### K1032 vs K0773

- **K1032** (satellite systems): Concepts unique to satellite ops (beacon, tracking modes, polarization alignment, orbital mechanics)
- **K0773** (telecom principles): General RF/comms concepts (spectrum analysis, modulation, frequency translation, signal-to-noise)

### K0740 vs K0741

- **K0740** (performance indicators): Quantitative metrics requiring interpretation (C/N ratio, noise temp, backoff level)
- **K0741** (availability measures): Binary/state indicators (locked/unlocked, online/offline, alarm status)

### Value Interpretation

- Reading a value = T0153 or T0431 (task)
- Interpreting what the value means = K0740 (knowledge)
- **Include both** when student must read AND understand significance

---

## Flagging Requirements

Bring to attention when:

- A scenario doesn't introduce at least 1-2 new codes
- A code *might* fit but it's borderline
- Proficiency progression seems misaligned with task complexity
- A code from the reference list seems like it should apply but doesn't quite fit

---

## Documentation Format

Per-scenario summary (AI-parseable):

```markdown
### Scenario N NICE Coverage

**Primary:** [codes], [codes]
**Supporting:** [codes], [codes], [codes]
**New this scenario:** [codes] or "None"
**Flags:** [any items for review] or "None"

| Code | Count | Application |
|------|-------|-------------|
| XXXX | N | Brief description |
```

---

## Work Role Reference

### Network Operations (IO-WRL-004) - Primary

| Code | Description |
|------|-------------|
| K0740 | Knowledge of system performance indicators |
| K0741 | Knowledge of system availability measures |
| K0770 | Knowledge of system administration principles and practices |
| K0773 | Knowledge of telecommunications principles and practices |
| K0737 | Knowledge of bandwidth management tools and techniques |
| K0792 | Knowledge of network configurations |
| K0718 | Knowledge of network communications principles and practices |
| K0689 | Knowledge of network infrastructure principles and practices |
| K0721 | Knowledge of risk management principles and practices |
| K0751 | Knowledge of system threats |
| K0926 | Knowledge of signal jamming tools and techniques |
| K1032 | Knowledge of satellite-based communication systems and software |
| S0077 | Skill in securing network communications |
| S0421 | Skill in operating network equipment |
| S0675 | Skill in optimizing system performance |
| S0815 | Skill in troubleshooting network equipment |
| T0081 | Diagnose network connectivity problems |
| T0129 | Integrate new systems into existing network architecture |
| T0153 | Monitor network capacity and performance |
| T1143 | Develop network backup and recovery procedures |
| T1313 | Test network infrastructure, including software and hardware devices |
| T1314 | Maintain network infrastructure, including software and hardware devices |

### System Administration (IO-WRL-005)

| Code | Description |
|------|-------------|
| K0064 | Knowledge of performance tuning tools and techniques |
| K0645 | Knowledge of standard operating procedures (SOPs) |
| S0582 | Skill in troubleshooting system performance |
| S0593 | Skill in handling incidents |
| S0672 | Skill in troubleshooting failed system components |
| S0677 | Skill in recovering failed systems |
| S0424 | Skill in executing command line tools |
| S0671 | Skill in implementing network infrastructure contingency and recovery plans |
| T0431 | Check system hardware availability, functionality, integrity, and efficiency |
| T1567 | Configure system hardware, software, and peripheral equipment |
| T1538 | Resolve customer-reported system incidents and events |
| T1588 | Diagnose faulty system and server hardware |

### Technical Support (IO-WRL-007)

| Code | Description |
|------|-------------|
| S0478 | Skill in providing customer support |
| T1580 | Monitor client-level computer system performance |

### Systems Testing and Evaluation (DD-WRL-007)

| Code | Description |
|------|-------------|
| T0531 | Troubleshoot hardware/software interface and interoperability problems |
| T1020 | Determine the operational and safety impacts of cybersecurity lapses |

### Data Analysis (IO-WRL-001)

| Code | Description |
|------|-------------|
| S0648 | Skill in detecting anomalies |
| T1429 | Prepare trend analysis reports |

### Cross-Cutting

| Code | Description |
|------|-------------|
| S0615 | Skill in protecting a network against malware |
| S0807 | Skill in solving problems |
| T1144 | Implement network backup and recovery procedures |
| T1334 | Produce cybersecurity instructional materials |
| T1411 | Deliver technical training to customers |
| T1606 | Prepare impact reports |

---

## Scenario Coverage Tracking

### Scenario 1: First Day

**Primary:** K0740, K0741, T0153
**Supporting:** K0645, K0773, K1032, S0421, T0431
**New this scenario:** K0645, K0740, K0741, K0773, K1032, S0421, T0153, T0431
**Flags:** None

| Code | Count | Application |
|------|-------|-------------|
| S0421 | 6 | UI navigation to equipment panels |
| K0740 | 5 | Interpreting performance metrics (noise temp, C/N, backoff, constellation) |
| K0773 | 5 | Telecom principles (LNB, spectrum analyzer, modulation, polarization) |
| T0153 | 4 | Monitoring beacon, receiver, tracking, alarms |
| K1032 | 4 | Satellite concepts (beacon, tracking modes, polarization) |
| K0741 | 2 | Availability status (GPSDO lock, alarm dashboard) |
| T0431 | 3 | Hardware checks (GPSDO, LNB, HPA) |
| K0645 | 1 | SOP review (mission brief) |# NICE Code Mapping Guide for SignalRange Scenarios

**Version:** 1.0
**Last Updated:** January 2026
**Purpose:** Definitive reference for consistent NICE code assignment across all SignalRange scenarios

---

## Core Principles

1. **Comprehensive assignment:** 2-4 codes per objective when legitimately applicable
2. **Task-driven:** Codes match what the objective actually requires, not the scenario's proficiency level
3. **Accuracy over coverage:** Never force a code; flag gaps instead
4. **Multi-role support:** Pull from any applicable work role (Network Ops, Sys Admin, Tech Support, etc.)
5. **Condition-based:** Map codes to what the objective's conditions actually test (action, quiz, or both)

---

## Assignment Process

For each objective:

1. Read the `conditions` array - what is the student actually doing/answering?
2. Assign S-codes for skills being performed (operating, configuring, troubleshooting)
3. Assign T-codes for tasks being executed (monitoring, diagnosing, testing)
4. Assign K-codes for knowledge being demonstrated (interpreting metrics, understanding concepts)
5. Write 1-2 line comment explaining the mapping rationale

---

## Condition Type Defaults

| Condition Type | Default Codes | Rationale |
|----------------|---------------|-----------|
| `ground-station-selected` | S0421 | Operating equipment interface |
| `tab-active` | S0421 | Navigating equipment panels |
| `equipment-powered` | T0431 | Checking hardware availability |
| `status-check` (quiz) | K-codes based on question content | Knowledge demonstration |
| `signal-detected` | T0153 | Monitoring performance |
| `mission-brief-opened` | K0645 | SOP familiarity |

---

## Code Selection Rules

### T0431 vs T0153

- **T0431** (check hardware): Is it on? Is it in the right state? Is it available?
- **T0153** (monitor performance): What are the metrics? Is quality good?
- **Include both** when objective checks state AND requires interpreting metrics

### K1032 vs K0773

- **K1032** (satellite systems): Concepts unique to satellite ops (beacon, tracking modes, polarization alignment, orbital mechanics)
- **K0773** (telecom principles): General RF/comms concepts (spectrum analysis, modulation, frequency translation, signal-to-noise)

### K0740 vs K0741

- **K0740** (performance indicators): Quantitative metrics requiring interpretation (C/N ratio, noise temp, backoff level)
- **K0741** (availability measures): Binary/state indicators (locked/unlocked, online/offline, alarm status)

### Value Interpretation

- Reading a value = T0153 or T0431 (task)
- Interpreting what the value means = K0740 (knowledge)
- **Include both** when student must read AND understand significance

---

## Flagging Requirements

Bring to attention when:

- A scenario doesn't introduce at least 1-2 new codes
- A code *might* fit but it's borderline
- Proficiency progression seems misaligned with task complexity
- A code from the reference list seems like it should apply but doesn't quite fit

---

## Documentation Format

Per-scenario summary (AI-parseable):

```markdown
### Scenario N NICE Coverage

**Primary:** [codes], [codes]
**Supporting:** [codes], [codes], [codes]
**New this scenario:** [codes] or "None"
**Flags:** [any items for review] or "None"

| Code | Count | Application |
|------|-------|-------------|
| XXXX | N | Brief description |
```

---

## Work Role Reference

### Network Operations (IO-WRL-004) - Primary

| Code | Description |
|------|-------------|
| K0740 | Knowledge of system performance indicators |
| K0741 | Knowledge of system availability measures |
| K0770 | Knowledge of system administration principles and practices |
| K0773 | Knowledge of telecommunications principles and practices |
| K0737 | Knowledge of bandwidth management tools and techniques |
| K0792 | Knowledge of network configurations |
| K0718 | Knowledge of network communications principles and practices |
| K0689 | Knowledge of network infrastructure principles and practices |
| K0721 | Knowledge of risk management principles and practices |
| K0751 | Knowledge of system threats |
| K0926 | Knowledge of signal jamming tools and techniques |
| K1032 | Knowledge of satellite-based communication systems and software |
| S0077 | Skill in securing network communications |
| S0421 | Skill in operating network equipment |
| S0675 | Skill in optimizing system performance |
| S0815 | Skill in troubleshooting network equipment |
| T0081 | Diagnose network connectivity problems |
| T0129 | Integrate new systems into existing network architecture |
| T0153 | Monitor network capacity and performance |
| T1143 | Develop network backup and recovery procedures |
| T1313 | Test network infrastructure, including software and hardware devices |
| T1314 | Maintain network infrastructure, including software and hardware devices |

### System Administration (IO-WRL-005)

| Code | Description |
|------|-------------|
| K0064 | Knowledge of performance tuning tools and techniques |
| K0645 | Knowledge of standard operating procedures (SOPs) |
| S0582 | Skill in troubleshooting system performance |
| S0593 | Skill in handling incidents |
| S0672 | Skill in troubleshooting failed system components |
| S0677 | Skill in recovering failed systems |
| S0424 | Skill in executing command line tools |
| S0671 | Skill in implementing network infrastructure contingency and recovery plans |
| T0431 | Check system hardware availability, functionality, integrity, and efficiency |
| T1567 | Configure system hardware, software, and peripheral equipment |
| T1538 | Resolve customer-reported system incidents and events |
| T1588 | Diagnose faulty system and server hardware |

### Technical Support (IO-WRL-007)

| Code | Description |
|------|-------------|
| S0478 | Skill in providing customer support |
| T1580 | Monitor client-level computer system performance |

### Systems Testing and Evaluation (DD-WRL-007)

| Code | Description |
|------|-------------|
| T0531 | Troubleshoot hardware/software interface and interoperability problems |
| T1020 | Determine the operational and safety impacts of cybersecurity lapses |

### Data Analysis (IO-WRL-001)

| Code | Description |
|------|-------------|
| S0648 | Skill in detecting anomalies |
| T1429 | Prepare trend analysis reports |

### Cross-Cutting

| Code | Description |
|------|-------------|
| S0615 | Skill in protecting a network against malware |
| S0807 | Skill in solving problems |
| T1144 | Implement network backup and recovery procedures |
| T1334 | Produce cybersecurity instructional materials |
| T1411 | Deliver technical training to customers |
| T1606 | Prepare impact reports |

---

## Scenario Coverage Tracking

### Scenario 1: First Day

**Primary:** K0740, K0741, T0153
**Supporting:** K0645, K0773, K1032, S0421, T0431
**New this scenario:** K0645, K0740, K0741, K0773, K1032, S0421, T0153, T0431
**Flags:** None

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
