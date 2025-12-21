# SignalRange NATS Campaign Plan

## Campaign Overview

**Title:** North Atlantic Teleport Services - First Season
**Duration:** 8 core levels + bonus content
**Character Arc:** Charlie Brooks trains you as part of his normal duties before his planned departure to start his own company in Europe
**Location:** Vermont Ground Station (VT-01), with Maine backup site (ME-02)
**Satellite Constellation:** **TIDEMARK** (maritime communications GEO constellation operated by SeaLink Global Communications)

---

## Design Philosophy

### Learning Progression

1. **Levels 1-3:** Tutorial phase - introduce all UI elements and basic operations without pressure
2. **Levels 4-5:** Mastery phase - test player calculations and understanding without support
3. **Levels 6-8:** Pressure phase - introduce time limits and perform under pressure

### Educational Goals

- Teach realistic satellite ground station operations
- Build from observation → guided practice → independent execution
- Introduce all available UI functions before testing competency
- Create authentic operational scenarios operators actually face

---

## The TIDEMARK Constellation

**Operator:** SeaLink Global Communications
**Purpose:** Maritime broadband and IoT connectivity
**Coverage:** Atlantic Ocean region (Americas, Europe, Africa)
**Frequency Bands:** C-band and Ku-band

### Orbital Slots

- **TIDEMARK-1:** 53°W (operational, 8 years old, inclined orbit due to fuel conservation)
- **TIDEMARK-2:** 45°W (newly operational)
- **TIDEMARK-3:** 37°W (operational)
- **TIDEMARK-4:** 29°W (final launch, commissioning phase)

---

## Level Breakdown

### **Level 1: "First Day"**

**Phase:** Tutorial
**Time Pressure:** None
**Calculation Required:** None
**New UI Elements:** All panels (observation only)

#### Premise

Your actual first day at NATS. Charlie walks you through a routine health check on already-operational equipment. TIDEMARK-1 is in service and you're learning what each indicator means.

#### Scenario

- TIDEMARK-1 is already online and serving customer traffic
- You're checking system status, not establishing contact
- Charlie explains each equipment panel as you click through
- No time pressure, no failure states
- Pure observation and familiarization

#### What You Learn

- Equipment power states and indicators
- GPSDO monitoring (already locked, showing stable reference)
- Basic antenna position reading (pointing at 53°W)
- Spectrum analyzer observation (beacon signal already present)
- Understanding the equipment rack layout and organization
- Reading telemetry displays

#### Dialog Tone

Professional and efficient. Charlie doesn't have time to waste but isn't unfriendly.

**Example:** "I've got three new hires to train before I leave next month, so let's make good use of our time. Click on the GPSDO panel. See that green lock indicator? That's what we want to see - means we've got a stable 10 MHz reference for the entire rack."

#### Victory Condition

Successfully tour all equipment panels and correctly identify key indicators when prompted.

---

### **Level 2: "Scheduled Maintenance"**

**Phase:** Tutorial
**Time Pressure:** None
**Calculation Required:** None (all values provided)
**New UI Elements:** LNB/BUC/ACU controls, RF mute switches

#### Premise

Take TIDEMARK-1 offline for planned antenna maintenance, then bring it back online. First time actually touching the controls yourself.

#### Scenario

- Maintenance crew needs to work on the antenna feed assembly
- Charlie provides all frequency values and settings
- You power down transmit chain in proper sequence
- Antenna goes to stow position for maintenance access
- After "maintenance" (time skip), you bring it back up
- First time configuring LNB and BUC parameters yourself

#### What You Learn

- Proper power-down sequences (HPA → BUC → LNB → stow)
- Why sequence matters (safety - don't radiate the maintenance crew)
- Stow position commands
- Setting LNB gain and LO frequency (values provided)
- Setting BUC LO frequency and output level (values provided)
- BUC mute/unmute procedures
- Understanding RF safety protocols

#### Dialog Tone

Matter-of-fact safety emphasis. This is serious business.

**Example:** "The maintenance crew is on the tower in fifteen minutes. We do this right, or someone gets a face full of RF. Let's start with the HPA. See that red ENABLE button? Click ARM first, then DISABLE. Two-step process prevents accidents."

#### Challenge

- Power down in correct sequence
- Configure stow position
- After maintenance window, power up in correct sequence
- Restore service to TIDEMARK-1

#### Victory Condition

Successfully power down, then restore service without errors or safety violations.

---

### **Level 3: "Weather Emergency Handover"**

**Phase:** Tutorial
**Time Pressure:** Mild (30 minutes, generous)
**Calculation Required:** None
**New UI Elements:** Ground station switcher, RX/TX modem panels, network status

#### Premise

A blizzard is approaching Vermont. You need to hand TIDEMARK-1 traffic from VT-01 to the backup site in Maine (ME-02) before the weather degrades the link.

#### Scenario

- Weather forecast shows heavy snow arriving in 30 minutes
- Link margin will degrade below operational threshold
- Catherine (operations manager) has coordinated with network ops
- You configure ME-02 ground station remotely
- Monitor both sites simultaneously during handover
- First exposure to multi-site operations
- First time touching modem configuration panels

#### What You Learn

- Ground station selector in UI
- Monitoring multiple equipment racks simultaneously
- Receiver modem configuration basics (frequency, symbol rate)
- Transmitter modem configuration basics (frequency, power level)
- Understanding network coordination procedures
- Graceful service handover concepts

#### Dialog Tone

Routine urgency - this happens regularly, not a crisis.

**Example:** "Weather handovers are standard procedure up here. Catherine's already coordinating with the network ops center. We just need to configure Maine before the link margin drops. Switch to ME-02 in the ground station selector. See it? Good. Now let's verify their equipment status before we hand over the traffic."

#### Challenge

- Switch between VT-01 and ME-02 views
- Verify ME-02 equipment is ready
- Configure ME-02 to match VT-01 settings (values provided)
- Coordinate handover timing
- Verify service continuity after handover

#### Victory Condition

Successfully transition traffic to ME-02 before weather window closes. VT-01 link margin must remain above threshold until traffic is transferred.

---

### **Level 4: "New Bird, No Handbook"**

**Phase:** Mastery
**Time Pressure:** None
**Calculation Required:** Yes (RF to IF conversions)
**New UI Elements:** Reference guide, calculation confirmation dialogs

#### Premise

TIDEMARK-2 just reached geostationary orbit at 45°W. Spacecraft team has provided the beacon frequency, but you need to calculate all IF frequencies yourself. No more pre-filled values.

#### Scenario

- TIDEMARK-2 beacon frequency provided: 3,947.8 MHz
- Target IF frequency (standard): 1,247.5 MHz
- You must calculate required LNB LO frequency
- You must select appropriate filter bandwidth
- You must configure spectrum analyzer parameters
- Charlie checks your math before you execute

#### What You Learn

- RF to IF conversion calculations
  - Formula: IF = RF_in - LO
  - Therefore: LO = RF_in - IF_target
  - Example: 3947.8 MHz - 1247.5 MHz = 2700.3 MHz LO
- Why LNB LO frequency selection matters
- Filter bandwidth selection based on signal type (CW beacon)
- Spectrum analyzer span/RBW tradeoffs
- Using reference documentation effectively

#### Dialog Tone

Professional expectation - you should be able to do this now.

**Example:** "The spacecraft team just sent the beacon frequency: 3,947.8 MHz. Standard IF target is 1,247.5 MHz. You've got the equations in the reference guide. Show me your LO calculation before you configure the LNB. I need to see your work."

#### Challenge

- Calculate correct LNB LO frequency (3947.8 - 1247.5 = 2700.3 MHz)
- Select appropriate filter bandwidth (narrow for CW beacon)
- Configure spectrum analyzer:
  - Center frequency: 1247.5 MHz
  - Span: 5 kHz (narrow for CW)
  - RBW: 100 Hz (very narrow for CW)
  - Reference level: appropriate for expected signal
- Present calculations to Charlie for approval
- Execute configuration

#### Victory Condition

Successfully acquire TIDEMARK-2 beacon on first try. Charlie approves your calculations and the signal appears cleanly on the spectrum analyzer.

---

### **Level 5: "Inclined Orbit Operations"**

**Phase:** Mastery
**Time Pressure:** Mild
**Calculation Required:** Yes (as needed)
**New UI Elements:** TLE update notifications, real-time satellite position tracking

#### Premise

TIDEMARK-1 is eight years old and running low on fuel. SeaLink stopped north-south station-keeping to extend the satellite's operational life. The orbit is now inclined, causing the satellite to trace a figure-8 pattern daily. Service continues, but requires active tracking.

#### Scenario

- TIDEMARK-1 orbital inclination: ~2 degrees (and growing)
- Satellite appears to move north-south in the sky daily
- ACU must be updated periodically to maintain pointing
- TLE updates arrive automatically every 15 minutes
- You must apply updates and verify antenna lock
- 30-minute scenario tracking through half of the figure-8 pattern

#### What You Learn

- Understanding orbital inclination effects on GEO satellites
- ACU tracking of inclined orbit satellites
- Applying TLE (Two-Line Element) updates
- Program track with frequent updates
- Maintaining service on a "moving" GEO target
- When to transition between program track and step track

#### Dialog Tone

Charlie explains this as routine end-of-life operations.

**Example:** "TIDEMARK-1 launched eight years ago. Fuel's running low, so SeaLink stopped doing north-south station-keeping last month. Means the orbit's inclined now - satellite traces a figure-8 pattern relative to the ground. Still provides service, but you need to update the ACU pointing every fifteen minutes or so. TLEs will come in automatically; you just need to apply them and verify lock."

#### Challenge

- Monitor TIDEMARK-1 position drift over time
- Recognize when antenna pointing error exceeds threshold
- Apply TLE updates when they arrive (or manually request)
- Update ACU program track with new orbital elements
- Verify antenna lock after each update
- Maintain service quality (C/N ratio) throughout
- Complete 30-minute tracking window with 3-4 TLE updates

#### Victory Condition

Maintain continuous service for 30 minutes with proper TLE update application. Antenna pointing error must not exceed 0.1 degrees. No loss of lock.

---

### **Level 6: "Interference Hunt"**

**Phase:** Pressure
**Time Pressure:** High (15 minutes)
**Calculation Required:** As needed
**New UI Elements:** Wide-span spectrum sweep, interference measurement tools, filter notch controls

#### Premise

Customer reports intermittent service degradation on TIDEMARK-1. SLA clock is ticking - you have 15 minutes to identify and resolve the interference before penalties kick in. Charlie is tied up on another call.

#### Scenario

- Carrier-to-interference (C/I) ratio has degraded
- Unknown interferer in adjacent channel
- Customer traffic is experiencing packet loss
- Must identify: interference frequency, type, and source
- Must implement mitigation solution
- Time pressure: 15 minutes until SLA breach
- Charlie is briefly available via intercom but mostly unavailable

#### What You Learn

- Spectrum analyzer sweep modes (wide-span search)
- Interference identification techniques
- Distinguishing interference types:
  - Adjacent channel carrier
  - Harmonic interference
  - Intermodulation products
  - Broadband noise
- Filter bank adjustment for rejection
- Frequency coordination procedures
- Working independently under pressure

#### Dialog Tone

Brief and direct - Charlie is busy, you need to handle this.

**Example (intercom):** "I'm stuck on this call with another customer for at least ten minutes. Use the wide-span sweep to find the interferer. Check the filter bank settings - you might be able to notch it out. If it's adjacent channel, we might need to coordinate a frequency change. Page me if you absolutely need help, but I trust you can handle this."

#### Challenge

- Switch spectrum analyzer to wide-span mode
- Sweep across frequency range to locate interferer
- Identify interference characteristics:
  - Frequency location
  - Bandwidth
  - Power level
  - Type (carrier vs noise vs harmonic)
- Determine mitigation strategy:
  - Adjust IF filter to reject interference
  - Request frequency coordination (if needed)
  - Adjust antenna pointing for better isolation
- Implement solution
- Verify C/I ratio restored to acceptable level

#### Victory Condition

Restore C/N ratio to acceptable level (improvement of at least 6 dB) within 15 minutes. Customer traffic packet loss must return to normal levels.

---

### **Level 7: "Equipment Cascade"**

**Phase:** Pressure
**Time Pressure:** High (20 minutes)
**Calculation Required:** As needed
**New UI Elements:** Fault isolation tools, backup system controls, holdover monitoring

#### Premise

10 PM shift. GPSDO has lost GNSS lock and entered holdover mode. Charlie is at dinner but reachable by phone. You're solo on console and need to maintain TIDEMARK-1 service while troubleshooting.

#### Scenario

- GPSDO shows holdover alarm (lost satellite lock)
- Frequency stability slowly degrading over time
- Must maintain service while troubleshooting
- Limited time before accumulated drift causes service loss
- 5 minutes into troubleshooting: LNB temperature alarm appears
- Cascade failure scenario - multiple issues to manage
- Charlie provides phone support but cannot physically help

#### What You Learn

- GPSDO holdover behavior and limits
- Frequency stability specifications and drift rates
- LNB thermal management and protection
- Troubleshooting methodology under pressure
- Equipment redundancy and backup procedures
- When to switch to backup systems vs. fix primary
- Managing multiple simultaneous faults
- Remote troubleshooting with expert support

#### Dialog Tone

Supportive but remote - Charlie talks you through it.

**Example (phone):** "Okay, walk me through what you're seeing. GPSDO is in holdover - how long has it been? ... Check the stability spec on the panel. Yeah, you've got about twenty minutes before it drifts too far. Let's start with the obvious - is the GPS antenna cable secure? Check the roof access logs; maybe maintenance disturbed something."

#### Challenge

**Primary Fault: GPSDO Holdover**

- Diagnose cause of GNSS lock loss
- Possible causes:
  - GPS antenna cable disconnected
  - Antenna view obstructed (snow accumulation?)
  - Local GPS jamming/interference
  - GPS constellation issue
- Monitor frequency stability degradation
- Decide: wait for relock or switch to backup reference?
- If switching, transition without service interruption

**Secondary Fault: LNB Temperature Alarm (appears at 5-minute mark)**

- LNB temperature rising above operational limit
- Possible causes:
  - Thermal control failure
  - Excess input power
  - Environmental (cooling system issue)
- Decide: reduce gain, reduce power, or switch to backup LNB?
- Implement solution while maintaining service

**Time Limit:** 20 minutes before frequency drift exceeds specification and service is lost

#### Victory Condition

- Maintain TIDEMARK-1 service continuity (no loss of lock)
- Resolve GPSDO issue (restore lock or switch to backup)
- Resolve LNB temperature issue (bring temp back to normal range)
- Complete within 20-minute window

---

### **Level 8: "First Light Solo"**

**Phase:** Pressure
**Time Pressure:** Moderate (45 minutes - realistic first light timeline)
**Calculation Required:** Yes (all frequencies, no assistance)
**New UI Elements:** None (mastery of all existing)

#### Premise

Charlie's last day is tomorrow. Today, you conduct first light for TIDEMARK-4 independently while he observes. This is your final evaluation before he leaves.

#### Scenario

- TIDEMARK-4 just reached 29°W orbital slot
- Complete acquisition procedure without assistance
- Charlie is present but silent unless you make a critical safety error
- Full end-to-end procedure:
  - GPSDO verification
  - RF front-end configuration (LNB, BUC)
  - Antenna acquisition (program track → step track)
  - Spectrum analyzer configuration
  - Beacon acquisition
  - Receiver lock verification
  - Transmit chain activation (BUC unmute → HPA enable)
  - Bidirectional link establishment
- Minor realistic complications will occur
- You must handle them independently

#### What You Learn

- Confidence in complete procedures
- Independent decision-making under observation
- Professional composure during evaluation
- Mastery of all previous skills
- Handling unexpected complications
- Knowing when to be cautious vs. when to proceed

#### Dialog Tone

**Pre-mission:** Direct but encouraging.
"I'm not going to hold your hand today. You've done the training. TIDEMARK-4's beacon frequency is in the ops note: 4,023.7 MHz. Target IF is standard 1,247.5 MHz. I'll be watching, but this is your show. If you're about to make a safety-critical error, I'll stop you. Otherwise, run the procedure."

**During mission:** Silent unless safety issue

**Post-mission:** Simple professional acknowledgment.
"Clean execution. You're ready for solo ops. Catherine will have the duty schedule for you tomorrow."

#### Scripted Complications

**Complication 1 (at 15 minutes):** Beacon signal 3 dB weaker than predicted

- Expected signal: -95 dBm
- Actual signal: -98 dBm
- You must decide: adjust LNB gain? Adjust spectrum analyzer reference level? Verify antenna pointing?
- Solution: Increase LNB gain by 3 dB, verify signal is now visible

**Complication 2 (at 30 minutes):** Antenna slew rate slower than expected

- ACU reports slew to 29°W will take 8 minutes instead of expected 5
- Not a fault, just slower equipment than other sites
- Tests your patience and procedure adherence
- Solution: Wait for completion, verify lock before proceeding

#### Challenge

- Calculate all frequencies without assistance
  - LNB LO: 4023.7 - 1247.5 = 2776.2 MHz
  - Verify BUC LO settings
  - Calculate spectrum analyzer parameters
- Execute complete first light procedure:
  1. Verify GPSDO lock
  2. Configure LNB (LO, gain)
  3. Configure BUC (LO, power, muted)
  4. Configure antenna (program track to 29°W)
  5. Configure IF filter
  6. Configure spectrum analyzer
  7. Acquire beacon on spectrum analyzer
  8. Switch to step track mode
  9. Verify receiver modem lock
  10. Unmute BUC
  11. Enable HPA (with proper back-off)
  12. Verify bidirectional link
- Handle complications independently
- Maintain safety protocols throughout
- Complete within 45-minute window

#### Victory Condition

- Establish bidirectional link with TIDEMARK-4
- Maintain stable link for 60 seconds
- Zero safety violations
- Handle complications without Charlie's intervention
- Complete within 45-minute timeline

#### Ending

**Immediate post-completion:**
Charlie: "Good work. You handled the gain adjustment correctly - I was wondering if you'd catch that the beacon was weaker than predicted. My last day's tomorrow - I'm finishing paperwork and handing off my projects. You're on the schedule for solo ops starting Monday. Don't hesitate to ask Catherine if something comes up."

**Optional final scene (after objectives complete):**
Brief handoff moment. Charlie at his desk, packing personal items.
"My contact info's in the company directory if you ever need to reach me in Europe. Best of luck."

Simple professional conclusion. The door is open for Charlie to return in a future campaign, but this isn't an emotional farewell - it's two professionals parting ways professionally.

---

## Bonus Levels (Post-Campaign)

### **Bonus 1: "Multi-Bird Management"**

**Premise:** Solar interference event affects all TIDEMARK satellites simultaneously. Maintain service on three satellites while managing degraded link conditions.

**Challenge:**

- Monitor TIDEMARK-1, 2, and 3 simultaneously
- Implement power control and modulation adjustments
- Prioritize critical traffic during link degradation
- Multi-tasking under pressure

---

### **Bonus 2: "Frequency Coordination Crisis"**

**Premise:** New competitor satellite launches into orbital slot adjacent to TIDEMARK-2. Both use same frequencies with opposite polarizations. Interference is mutual.

**Challenge:**

- Measure and analyze interference patterns
- Coordinate with competitor teleport (scripted dialogs)
- Implement polarization optimization
- Achieve specified isolation levels
- Document coordination for regulatory filing

---

### **Bonus 3: "Primary HPA Failure"**

**Premise:** Primary HPA fails during active TIDEMARK-3 pass. Must switch to backup HPA and restore service within SLA window.

**Challenge:**

- Rapid fault diagnosis
- Hot-swap to backup amplifier
- Reconfigure power levels
- Restore service within 5 minutes
- Verify service quality after recovery

---

## Progression Summary

| Level | Theme | Time | Calc | New UI | Realism |
|-------|-------|------|------|--------|---------|
| 1 | Introduction | None | None | All panels (read-only) | Observation only |
| 2 | Procedures | None | None | LNB/BUC/ACU controls | Guided operations |
| 3 | Coordination | 30 min | None | Multi-site, modems | Routine handover |
| 4 | Calculations | None | Yes | Reference guides | Standard acquisition |
| 5 | Inclined Orbit | Mild | Yes | TLE tracking | Aging satellite ops |
| 6 | Troubleshooting | 15 min | As needed | Interference tools | Real interference |
| 7 | Crisis Management | 20 min | As needed | Fault isolation | Equipment cascade |
| 8 | Independent Ops | 45 min | Yes | Everything together | Professional evaluation |

---

## Character Development Arc

### Charlie Brooks Evolution

**Level 1:** Professional trainer doing his job efficiently. Not unfriendly, but focused.

**Level 2-3:** Explains the "why" behind procedures. Emphasizes safety and professional standards.

**Level 4-5:** Steps back, expects you to figure things out. Validates your work but doesn't hand-hold.

**Level 6-7:** Trusts you with real responsibility. Available for support but expects independence.

**Level 8:** Final evaluation. Silent observer. Simple professional acknowledgment of competency.

**Post-Campaign:** Contact info available. Door open for future story hooks (potential return in different campaign).

### Key Character Notes

- Charlie is leaving on his own timeline - not because of player
- His training is professional obligation, not personal mentorship
- Departure is matter-of-fact, not emotional
- Represents realistic workplace dynamics
- Leaves door open for crossover in future campaigns

---

## Difficulty Curve

```
Complexity ↑
          |                                    ●8
          |                               ●7
          |                          ●6
          |                    ●5
          |              ●4
          |         ●3
          |    ●2
          | ●1
          |_________________________________
                    Levels →
```

---

## Technical Learning Objectives

### By End of Level 3 (Tutorial Phase)

- Understand all equipment panels and their functions
- Know proper power sequencing (safety)
- Can monitor system status indicators
- Understand multi-site operations
- Familiar with basic modem configuration

### By End of Level 5 (Mastery Phase)

- Can calculate RF to IF conversions independently
- Understands filter selection for different signal types
- Can configure spectrum analyzer for signal acquisition
- Knows how to handle dynamic tracking scenarios
- Confident in equipment configuration without guidance

### By End of Level 8 (Pressure Phase)

- Can troubleshoot interference independently
- Handles equipment failures under time pressure
- Executes complete first light procedures solo
- Makes independent decisions under observation
- Ready for real-world operations

---

## Design Notes

### Authenticity Principles

- Every scenario is something real operators encounter
- Equipment behavior matches real RF physics
- Procedures follow industry standards
- Time pressures are realistic (not artificial)
- Complications are plausible failures/conditions

### Player Agency

- No arbitrary failure states
- Player can take time to think (except timed missions)
- Reference materials always available
- Mistakes are learning opportunities (can retry)
- Success through understanding, not memorization

### Replayability

- Different approaches to some challenges
- Bonus objectives for optimization
- Time-based scoring for competitive players
- Achievement system for completionists

---

## Future Campaign Hooks

### Potential Charlie Return

- Guest appearance in European teleport campaign
- Technical consultant for complex mission
- Competitive scenario (friendly rivalry)
- Emergency callback for crisis

### TIDEMARK Constellation Evolution

- New satellites joining fleet
- Aging infrastructure challenges
- Competitor scenarios
- Technology upgrades

### Other Character Development

- Catherine Vega (operations manager) - potential future mentor
- Network operations center staff
- Customer interactions
- Equipment vendors/support

---

## Implementation Priority

### Phase 1 (MVP for January 2026 launch)

- Levels 1-4 fully implemented
- Core dialog system
- Basic achievement tracking
- Essential UI elements

### Phase 2 (Post-launch enhancement)

- Levels 5-8 implementation
- Advanced UI features
- Bonus levels
- Enhanced dialog system

### Phase 3 (Future expansion)

- Additional campaigns
- Multiplayer/collaborative scenarios
- Advanced equipment models
- Expanded constellation
