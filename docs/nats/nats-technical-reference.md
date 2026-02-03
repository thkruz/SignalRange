# NATS Technical Reference

**Document Type:** Campaign Technical Specifications  
**Campaign:** North Atlantic Teleport Services (NATS)  
**Last Updated:** January 2026

---

## 1. Satellite Constellation

### 1.1 TIDEMARK Satellites

The NATS campaign uses the TIDEMARK constellation, operated by SeaLink Global Communications for maritime broadband across the Atlantic.

| Satellite | Position | Orbit Type | Status | Used In |
|-----------|----------|------------|--------|---------|
| TIDEMARK-1 | 53°W | GEO | Operational (8+ years, aging) | Scenarios 1-3, 5, 7 |
| TIDEMARK-2 | 45°W | GEO | Newly operational | Scenario 4 |
| TIDEMARK-3 | 37°W | GEO | Operational | Background reference |
| TIDEMARK-4 | 29°W | GEO | Commissioning | Future scenarios |

### 1.2 Other Satellites

| Satellite | Position | Orbit Type | Notes | Used In |
|-----------|----------|------------|-------|---------|
| SES-10 | 67°W | GEO | Third-party satellite | Background/interference |
| AURORA-7 | 190° Az | Geosynchronous (inclined ~3°) | Legacy, 15+ years old | Scenario 6 |

---

## 2. Frequency Plan

### 2.1 C-Band Allocation

| Function | Frequency Range |
|----------|-----------------|
| Downlink (space-to-Earth) | 3.7 – 4.2 GHz |
| Uplink (Earth-to-space) | 5.925 – 6.425 GHz |
| Beacons | ~4.1 – 4.2 GHz |

### 2.2 TIDEMARK-1 Frequencies

**Source of Truth:** `satellites.ts`

| Parameter | Value |
|-----------|-------|
| Beacon RF | **4175.5 MHz** |
| TP-1 Uplink Center | 5943 MHz |
| TP-1 Downlink Center | 3718 MHz |
| TP-2 Uplink Center | 5906 MHz |
| TP-2 Downlink Center | 3681 MHz |
| Transponder Bandwidth | 36 MHz |
| Frequency Offset (Uplink - Downlink) | 2225 MHz |

**Look Angles from VT-01:**
- Azimuth: 161.8°
- Elevation: 34.2°
- Polarization Rotation: 14°

### 2.3 TIDEMARK-2 Frequencies

| Parameter | Value |
|-----------|-------|
| Beacon RF | **4180 MHz** |
| TP-1 Uplink Center | 6017 MHz |
| TP-1 Downlink Center | 3792 MHz |
| Transponder Bandwidth | 36 MHz |

**Look Angles from VT-01:**
- Azimuth: 219.7°
- Elevation: 26.3°
- Polarization Rotation: -25°

### 2.4 SES-10 Frequencies

| Parameter | Value |
|-----------|-------|
| Beacon RF | **4178 MHz** |
| TP-1 Uplink Center | 5869 MHz |
| TP-1 Downlink Center | 3644 MHz |

### 2.5 AURORA-7 Frequencies

| Parameter | Value |
|-----------|-------|
| Beacon RF | **4165 MHz** |
| Uplink Center | 5830 MHz |
| Downlink Center | 3605 MHz |
| Transponder Bandwidth | 24 MHz (narrower than TIDEMARK) |

---

## 3. Ground Stations

### 3.1 VT-01 (Vermont) - Primary Station

| Parameter | Value |
|-----------|-------|
| Station ID | VT-01 |
| Location | Rural Vermont |
| Role | Primary ground station |
| Antenna | 9-meter C-band |

**LNB Configuration:**
| Parameter | Value |
|-----------|-------|
| LO Frequency | 5250 MHz |
| Gain | 60 dB |
| Noise Temperature | ~55 K (typical) |

**BUC Configuration:**
| Parameter | Value |
|-----------|-------|
| LO Frequency | 4900 MHz |

### 3.2 ME-02 (Maine) - Backup Station

| Parameter | Value |
|-----------|-------|
| Station ID | ME-02 |
| Location | ~150 miles from Vermont |
| Role | Backup for weather failover |
| Antenna | 9-meter C-band |

**LNB Configuration:** Same as VT-01 (5250 MHz LO, 60 dB gain)

**BUC Configuration:** Same as VT-01 (4900 MHz LO)

> **Note:** Both stations use identical LO frequencies so downstream IF frequencies match, simplifying handover procedures and reducing configuration errors.

---

## 4. IF Frequency Calculations

### 4.1 Receive Path (Downconversion)

The LNB downconverts RF to IF using high-side mixing:

```
IF = LO - RF
```

**With LNB LO = 5250 MHz:**

| Satellite | Beacon RF | Beacon IF | Calculation |
|-----------|-----------|-----------|-------------|
| TIDEMARK-1 | 4175.5 MHz | **1074.5 MHz** | 5250 - 4175.5 |
| TIDEMARK-2 | 4180 MHz | **1070 MHz** | 5250 - 4180 |
| SES-10 | 4178 MHz | **1072 MHz** | 5250 - 4178 |
| AURORA-7 | 4165 MHz | **1085 MHz** | 5250 - 4165 |

**Downlink IF (for receiver modem):**

| Satellite | Downlink RF | Downlink IF | Calculation |
|-----------|-------------|-------------|-------------|
| TIDEMARK-1 TP-1 | 3718 MHz | **1532 MHz** | 5250 - 3718 |
| TIDEMARK-2 TP-1 | 3792 MHz | **1458 MHz** | 5250 - 3792 |
| AURORA-7 | 3605 MHz | **1645 MHz** | 5250 - 3605 |

### 4.2 Transmit Path (Upconversion)

The BUC upconverts IF to RF using low-side mixing:

```
RF = IF + LO
IF = RF - LO
```

**With BUC LO = 4900 MHz:**

| Satellite | Uplink RF | TX IF | Calculation |
|-----------|-----------|-------|-------------|
| TIDEMARK-1 TP-1 | 5943 MHz | **1043 MHz** | 5943 - 4900 |
| TIDEMARK-2 TP-1 | 6017 MHz | **1117 MHz** | 6017 - 4900 |
| AURORA-7 | 5830 MHz | **930 MHz** | 5830 - 4900 |

> **Scenario 3 uses different TX IF:** The Maine transmitter modem is configured for 1094 MHz IF in scenario 3. This suggests either a different transponder or a scenario-specific configuration. Verify against scenario file if needed.

---

## 5. Equipment Default States

### 5.1 Operational State (Scenario 1)

When TIDEMARK-1 is online and serving traffic:

| Equipment | State |
|-----------|-------|
| GPSDO | Locked, providing 10 MHz reference |
| LNB | Powered, thermally stable, LO 5250 MHz |
| BUC | Powered, unmuted, LO 4900 MHz |
| HPA | Enabled, ~10 dB backoff |
| Antenna | Step-track or program-track on TIDEMARK-1 |
| RX Modem | Locked, receiving traffic |
| TX Modem | Transmitting |

### 5.2 Safe State (Switchover/Maintenance)

Before switching satellites or during maintenance:

| Equipment | State |
|-----------|-------|
| HPA | Disabled (no RF output) |
| BUC | Muted |
| Antenna | May remain pointed or commanded to stow |
| Modems | May continue operating (no RF path) |

### 5.3 Cold Standby (Backup Station)

Backup station waiting for activation:

| Equipment | State |
|-----------|-------|
| GPSDO | Locked (always on) |
| LNB | Powered off |
| BUC | Powered off or muted |
| HPA | Disabled |
| Antenna | Stowed or last known position |

---

## 6. Modem Configuration Reference

### 6.1 TIDEMARK-1 Standard Configuration

**Receiver Modem:**
| Parameter | Value |
|-----------|-------|
| Frequency | 1532 MHz (IF) |
| Bandwidth | 36 MHz |
| Modulation | QPSK |
| FEC | 3/4 |

**Transmitter Modem:**
| Parameter | Value |
|-----------|-------|
| Frequency | 1043 MHz (IF) |
| Bandwidth | 36 MHz |
| Modulation | QPSK |
| FEC | 3/4 |
| Power | -7 dBm (typical) |

### 6.2 AURORA-7 Configuration

**Receiver Modem:**
| Parameter | Value |
|-----------|-------|
| Frequency | 1645 MHz (IF) |
| Bandwidth | 24 MHz |
| Modulation | QPSK |
| FEC | 3/4 |

**Transmitter Modem:**
| Parameter | Value |
|-----------|-------|
| Frequency | 930 MHz (IF) |
| Bandwidth | 24 MHz |
| Modulation | QPSK |
| FEC | 3/4 |

---

## 7. Antenna Tracking Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Stow** | Antenna parked in safe position | Maintenance, severe weather |
| **Manual** | Operator-commanded position | Initial acquisition, troubleshooting |
| **Program-Track** | Follows predicted orbital elements | GEO satellites with good TLE |
| **Step-Track** | Uses beacon signal for continuous adjustment | Inclined orbits, aging satellites |

**AURORA-7 requires step-track** because its inclined orbit causes it to trace a figure-8 pattern in the sky. Program-track predictions aren't accurate enough.

---

## 8. Quick Reference Card

### Beacon IF Frequencies (LNB LO = 5250 MHz)

| Satellite | Beacon IF |
|-----------|-----------|
| TIDEMARK-1 | 1074.5 MHz |
| TIDEMARK-2 | 1070 MHz |
| SES-10 | 1072 MHz |
| AURORA-7 | 1085 MHz |

### TX IF Frequencies (BUC LO = 4900 MHz)

| Satellite | TX IF |
|-----------|-------|
| TIDEMARK-1 | 1043 MHz |
| TIDEMARK-2 | 1117 MHz |
| AURORA-7 | 930 MHz |

### Key Formulas

```
Receive:  IF = LO - RF     (high-side LNB)
Transmit: IF = RF - LO     (low-side BUC)
          RF = IF + LO
```

---

## 9. Related Documentation

| Document | Content |
|----------|---------|
| `nats-campaign-plan.md` | 24-scenario structure and progression |
| `nats-character-guide.md` | Charlie Brooks dialog writing guide |
| `scenario-development-guide.md` | How to write scenarios |
| `signalrange-platform-guide.md` | Platform architecture overview |
