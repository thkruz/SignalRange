# NATS Character Guide

**Document Type:** Campaign Character & Dialog Reference  
**Campaign:** North Atlantic Teleport Services (NATS)  
**Last Updated:** January 2026

This guide provides all context needed to write or revise dialog for SignalRange training scenarios featuring Charlie Brooks as the mentor character. Use this when creating new scenarios or refining existing ones.

---

## 1. Character Profile: Charlie Brooks

### 1.1 Background

| Attribute | Value |
|-----------|-------|
| **Role** | Senior Operator at North Atlantic Teleport Services (NATS) |
| **Experience** | 6 years at NATS, deep operational expertise |
| **Situation** | Transferring to a European ground station (unspecified). Family reasons. |
| **Training Load** | Has 3 new hires to train before he leaves, including the player |
| **Arc** | Mentors player through Phase 1 (Scenarios 1-8), then departs |

### 1.2 Personality & Motivation

- **Stressed but competent:** Busy, limited time, not going to waste it
- **Professional pride:** Sees poor trainee performance as a reflection of his teaching ability
- **Not emotionally invested:** This isn't his company. He wants you to succeed, but he's not your friend or cheerleader
- **Pragmatic teacher:** Shares just enough context to make lessons stick, no more
- **Dry humor:** Occasional, understated - never forced
- **Direct communication:** Short sentences when giving instructions. Says "Go." not "Whenever you're ready, please proceed."

### 1.3 What Charlie IS NOT

- Warm and nurturing
- Overly patient or encouraging
- Emotionally invested in your career
- Going to repeat himself
- Your buddy

### 1.4 Speech Patterns

- Terse when giving instructions
- Slightly more expansive when explaining *why* something matters
- Uses consequences to frame importance ("dBs are money", "ruin your day", "before the customer does")
- Shares war stories sparingly and briefly ("I've seen guys reach into the waveguide...")
- Acknowledges correct answers without gushing ("Good start", "Right answer", "That's solid")
- Dismisses you casually when done - he has his own work

### 1.5 Example Phrases

```
"Point is, I've got three of you to get up to speed before I leave, and not a lot of time to do it."
"I'm not repeating myself, but the system will."
"Don't be that person."
"You did fine."
"Go get some coffee or something. I've got logs to finish."
"Go."
```

---

## 2. Other Characters

### 2.1 Catherine Vega (Maine Operator)

| Attribute | Value |
|-----------|-------|
| **Role** | Operator at ME-02 (Maine backup station) |
| **Appears in** | Scenario 3 (Weather Handover) and later |
| **Personality** | Professional, helpful, provides sanity checks |

**Speech patterns:**
- Collaborative approach
- Offers practical validation ("I did a quick sanity check...")
- Casual but competent

### 2.2 Dana Torres (Shift Supervisor)

| Attribute | Value |
|-----------|-------|
| **Role** | Shift Supervisor at NATS |
| **Appears in** | Scenario 7+ |
| **Personality** | Peer-level, slightly skeptical of new hire's readiness |

**Speech patterns:**
- "Just making sure neither of us gets in trouble"
- Professional distance
- Checks in at key decision points

---

## 3. Dialog Structure

### 3.1 Format

Dialog is stored in a `dialogClips` object with:
- `intro`: Plays at scenario start
- `objectives`: Object keyed by objective ID, each containing dialog that plays after the player completes that objective

### 3.2 TypeScript Structure

```typescript
dialogClips: {
  intro: {
    text: `<p>...</p>`,
    character: Character.CHARLIE_BROOKS,
    emotion: Emotion.CONFIDENT,
    audioUrl: getAssetUrl('/assets/campaigns/nats/1/intro.mp3'),
  },
  objectives: {
    'objective-id': {
      text: `<p>...</p>`,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.CONFIDENT,
      audioUrl: getAssetUrl('/assets/campaigns/nats/1/obj-objective-id.mp3'),
    },
  },
},
```

### 3.3 Available Emotions

```typescript
export enum Emotion {
  NEUTRAL = 'neutral',
  HAPPY = 'happy',
  ANGRY = 'angry',
  SAD = 'sad',
  SURPRISED = 'surprised',
  CONCERNED = 'concerned',
  CONFIDENT = 'confident',
  SKEPTICAL = 'skeptical',
  EXCITED = 'excited',
  FRUSTRATED = 'frustrated',
}
```

### 3.4 Charlie's Typical Emotions

| Emotion | When to Use |
|---------|-------------|
| **CONFIDENT** | Default for most instructional dialog |
| **NEUTRAL** | Straightforward information delivery |
| **SKEPTICAL** | When player makes a questionable choice (later scenarios) |
| **FRUSTRATED** | When something goes wrong operationally (not at player) |
| **CONCERNED** | During anomaly/troubleshooting scenarios |

Charlie rarely uses: HAPPY (only genuine satisfaction), EXCITED (almost never), SAD (never), ANGRY (only in serious situations), SURPRISED (only if genuinely unexpected)

### 3.5 HTML Formatting

- Use `<p>` tags for paragraphs
- No other HTML formatting needed
- Template literals (backticks) for multi-line strings

---

## 4. Dialog Flow Pattern

### 4.1 Critical Rule: Hint BEFORE Question

The player must answer quiz questions to progress. Charlie should guide them to where they need to look BEFORE the question appears, without revealing the answer.

### 4.2 Pattern for Each Objective Dialog

1. **Acknowledge** the previous answer (1-2 sentences)
   - Brief, not effusive
   - Can add operational context about why that answer matters

2. **Teach** the next concept (2-4 sentences)
   - What is this equipment/indicator?
   - Why does it matter operationally?
   - What are the possible states/values?

3. **Navigate** to the correct location (1 sentence)
   - Explicitly state which tab to click
   - Be specific: "TX Chain tab" not "go check the transmitter"

4. **Prompt** for what to look for (1-2 sentences)
   - Tell them what to find without telling them the answer
   - End with a direct prompt or "Go."

### 4.3 Pattern for Final Objective Dialog

1. **Acknowledge** the final answer
2. **Summarize** what was covered (brief list)
3. **Set expectation** for next scenario
4. **Dismiss** casually - Charlie has other work

---

## 5. Navigation Reference

### 5.1 Player UI Buttons (Left Side)

- **Mission Brief** - Detailed mission background
- **Checklist** - Step-by-step procedures
- **Dialog History** - Replay character instructions
- **Vermont Ground Station (VT-01)** - Access equipment panels
- **Maine Ground Station (ME-02)** - Backup station (scenarios 3+)
- **TIDEMARK-1** - Satellite info

### 5.2 Ground Station Tabs

| Tab | Equipment/Functions |
|-----|---------------------|
| **Dashboard** | Overview, alarm aggregation, traffic status |
| **ACU Control** | Antenna pointing, tracking mode, polarization, feed heater |
| **RX Analysis** | LNB, spectrum analyzer, receiver modem, constellation |
| **TX Chain** | BUC, HPA, transmitter modem |
| **GPS Timing** | GPSDO status and timing info |

### 5.3 Navigation Language Examples

```
"Click Vermont Ground Station, then GPS Timing tab."
"Switch to the TX Chain tab."
"Stay on ACU Control."
"Head back to RX Analysis."
"Dashboard tab."
```

---

## 6. Technical Reference

### 6.1 Truth Data Sources

Before writing dialog, verify all technical details against:
- `satellites.ts` - Satellite parameters, frequencies, polarization
- `ground-stations.ts` - Equipment states, settings, values
- `nats-technical-reference.md` - Consolidated frequency and equipment data

### 6.2 TIDEMARK-1 Frequencies

> **Source of Truth:** `satellites.ts` and `nats-technical-reference.md`

| Parameter | Value |
|-----------|-------|
| Beacon RF frequency | **4175.5 MHz** |
| LNB LO frequency | 5250 MHz |
| Beacon IF frequency | **1074.5 MHz** (5250 - 4175.5) |

The spectrum analyzer shows IF, not RF.

### 6.3 TIDEMARK-2 Frequencies

| Parameter | Value |
|-----------|-------|
| Beacon RF frequency | **4180 MHz** |
| LNB LO frequency | 5250 MHz |
| Beacon IF frequency | **1070 MHz** (5250 - 4180) |

### 6.4 Common Values to Verify

- GPSDO lock state
- LNB noise temperature (in Kelvin)
- HPA state (enabled, backoff value)
- Antenna tracking mode
- Polarization angle
- Spectrum analyzer center frequency and reference level
- Receiver C/N ratio
- Modulation type (QPSK, etc.)

---

## 7. Campaign Universe

### 7.1 NATS (North Atlantic Teleport Services)

- Commercial satellite ground station facility
- Located in rural Vermont (VT-01 primary, ME-02 backup)
- Provides ground segment services for TIDEMARK constellation

### 7.2 TIDEMARK Constellation

- Owned by SeaLink Global Communications
- GEO satellites providing maritime broadband across the Atlantic
- TIDEMARK-1: 53°W, 8+ years old, starting to show age
- TIDEMARK-2: 45°W, newly operational

### 7.3 Player Role

- New hire at NATS
- Being trained by Charlie before he leaves
- Will eventually operate independently (Phase 2+)

---

## 8. Charlie's Arc Across Scenarios

### Phase 1: Foundation (Scenarios 1-8)

Charlie mentors the player through all Phase 1 scenarios.

| Scenarios | Charlie's Approach |
|-----------|-------------------|
| 1-2 | More explanation, setting baseline expectations |
| 3-5 | Standard teaching, expects basics to be understood |
| 6-8 | Shorter dialog, focuses on new concepts, treats player as more capable |

### Phase 2-3: Independent Operations (Scenarios 9-24)

Charlie has departed for Europe. Player operates with:
- Dana Torres (Shift Supervisor) for oversight
- Catherine Vega (Maine Operator) for coordination
- Other new characters TBD

---

## 9. Writing Checklist

Before submitting dialog:

### Technical Accuracy
- [ ] Verified all frequencies against `nats-technical-reference.md`
- [ ] Values match: condition params, objective descriptions, dialog text
- [ ] Equipment states match scenario premise

### Dialog Structure
- [ ] Each objective dialog includes navigation hint (which tab)
- [ ] Hints tell player WHERE to look, not WHAT the answer is
- [ ] Intro establishes scenario context and first task
- [ ] Final dialog summarizes, sets up next scenario, dismisses player

### Character Voice
- [ ] Charlie's voice is consistent (direct, professional, slightly impatient)
- [ ] No warm/fuzzy language that doesn't fit character
- [ ] Appropriate emotion selected for each clip
- [ ] Other characters (Catherine, Dana) have distinct voices

### Format
- [ ] All objective IDs match between dialog and objectives array
- [ ] HTML uses only `<p>` tags
- [ ] Template literals used for multi-line strings
- [ ] Audio URLs follow naming convention

---

## 10. Example: Good vs Bad Dialog

### ❌ Bad (too warm, too vague)

```
Great job on that one! You're really getting the hang of this. 
Now, whenever you're ready, take a look at the transmit side of 
things and see what you can find out about the amplifier status. 
Take your time!
```

### ✅ Good (Charlie's voice, specific navigation)

```
That's solid. The cooler the LNB runs, the less noise it adds 
to your signal. You start seeing that number climb, it's an 
early warning.

Now the HPA - High Power Amplifier. Takes your milliwatt signal 
and turns it into hundreds of watts. Also the equipment most 
likely to ruin your day if you're not paying attention.

TX Chain tab. Tell me what state the HPA is in.
```

---

## 11. Related Documentation

| Document | Content |
|----------|---------|
| `nats-campaign-plan.md` | 24-scenario structure and progression |
| `nats-technical-reference.md` | Frequencies, ground stations, equipment specs |
| `scenario-development-guide.md` | How to write scenarios, condition types |
| `signalrange-platform-guide.md` | Platform architecture overview |
| `boa-universe-guide.md` | BOA campaign characters (separate campaign) |
