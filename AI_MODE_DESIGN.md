# AI Mode Selection Design Document

## Overview

This document outlines the design for implementing three AI mode options in SignalRange:
1. **Cloud AI** - Cloudflare Worker-based chat interface (free tier)
2. **Local AI** - NVIDIA Orin-based local processing
3. **Non-AI Mode** - Traditional mode without AI assistance

## Table of Contents

1. [User Experience](#user-experience)
2. [Architecture Overview](#architecture-overview)
3. [Implementation Details](#implementation-details)
4. [Files to Modify/Create](#files-to-modifycreate)
5. [Technical Specifications](#technical-specifications)
6. [Future Considerations](#future-considerations)

---

## User Experience

### Initial Setup Flow

1. **First Launch / Settings Access**
   - User clicks on their profile button in the header
   - Profile modal opens (existing `ModalProfile`)
   - New "AI Settings" section appears in the profile modal
   - Three radio buttons or toggle switches for AI modes:
     - ☐ Cloud AI (Recommended)
     - ☐ Local AI
     - ☐ Non-AI Mode

2. **Mode Selection**
   - User selects their preferred mode
   - Settings are saved to user preferences (persisted in database)
   - Visual indicator shows current active mode (e.g., badge in header)
   - If switching modes, user may see a brief loading state

3. **Mode-Specific UI Elements**

   **Cloud AI Mode:**
   - Chat interface button/icon appears in header or as floating action button
   - Clicking opens a chat panel (right-side panel using `PanelManager`)
   - Natural language input field
   - Chat history display
   - "Powered by Cloudflare AI" indicator

   **Local AI Mode:**
   - Similar chat interface button
   - "Local Processing" indicator
   - Connection status indicator (connected/disconnected to Orin device)
   - Settings to configure Orin device IP/endpoint

   **Non-AI Mode:**
   - No chat interface visible
   - Traditional UI only
   - All AI-related features hidden

### Visual Indicators

- **Header Badge**: Small badge next to profile button showing current mode
  - "☁️ Cloud AI" (blue)
  - "🖥️ Local AI" (green)
  - "⚙️ Standard" (gray)

- **Chat Button**: Floating action button or header icon (only visible in AI modes)
  - Position: Bottom-right corner or header toolbar
  - Icon: Chat bubble icon
  - Badge: Shows unread message count if applicable

### Settings Persistence

- Settings stored in `UserPreferences` table
- Synced across devices via existing user account system
- Default: Non-AI Mode (for backward compatibility)

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    SignalRange App                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐      ┌──────────────┐               │
│  │ AI Mode      │──────│ AI Service   │               │
│  │ Manager      │      │ Interface    │               │
│  └──────────────┘      └──────┬───────┘               │
│                               │                        │
│                    ┌──────────┼──────────┐            │
│                    │          │          │            │
│            ┌───────▼───┐ ┌───▼────┐ ┌───▼────┐       │
│            │ Cloud AI  │ │ Local  │ │ Non-AI │       │
│            │ Service   │ │ AI     │ │ Service│       │
│            │           │ │ Service│ │ (No-op)│       │
│            └─────┬─────┘ └───┬────┘ └────────┘       │
│                  │           │                        │
│            ┌─────▼─────┐ ┌───▼────┐                  │
│            │ Cloudflare│ │ NVIDIA │                  │
│            │ Worker    │ │ Orin   │                  │
│            │ API       │ │ Device │                  │
│            └───────────┘ └────────┘                  │
└─────────────────────────────────────────────────────────┘
```

### Component Responsibilities

1. **AI Mode Manager**: Central coordinator for AI mode selection and switching
2. **AI Service Interface**: Abstract interface for AI operations
3. **Cloud AI Service**: Implementation for Cloudflare Worker integration
4. **Local AI Service**: Implementation for NVIDIA Orin integration
5. **Non-AI Service**: No-op implementation (fallback)
6. **Chat UI Component**: Reusable chat interface component
7. **Settings UI**: Integration into existing profile modal

---

## Implementation Details

### 1. Data Model Changes

#### UserPreferences Extension

Add to `src/user-account/types.ts`:

```typescript
export interface UserPreferencesData {
  // ... existing fields ...
  
  // AI settings
  aiMode: 'cloud' | 'local' | 'none';
  cloudAiEndpoint?: string; // Optional: custom Cloudflare Worker URL
  localAiEndpoint?: string; // Optional: NVIDIA Orin device IP/URL
  localAiApiKey?: string; // Optional: API key for local AI
}
```

### 2. Core Services

#### AI Mode Manager (`src/ai/ai-mode-manager.ts`)

**Purpose**: Singleton manager that coordinates AI mode selection and provides unified interface

**Key Methods**:
- `getCurrentMode(): 'cloud' | 'local' | 'none'`
- `setMode(mode: 'cloud' | 'local' | 'none'): Promise<void>`
- `getAIService(): AIService`
- `isAIModeEnabled(): boolean`
- `onModeChange(callback: (mode) => void): void`

**Responsibilities**:
- Load mode from user preferences on app init
- Switch between AI service implementations
- Emit events when mode changes
- Handle mode-specific initialization

#### AI Service Interface (`src/ai/ai-service.ts`)

**Purpose**: Abstract base class for all AI implementations

**Key Methods**:
- `sendMessage(message: string): Promise<AIMessageResponse>`
- `isAvailable(): Promise<boolean>`
- `getStatus(): AIStatus`
- `initialize(): Promise<void>`
- `cleanup(): void`

**Types**:
```typescript
interface AIMessageResponse {
  content: string;
  timestamp: number;
  error?: string;
}

interface AIStatus {
  available: boolean;
  connected: boolean;
  latency?: number;
  error?: string;
}
```

#### Cloud AI Service (`src/ai/cloud-ai-service.ts`)

**Purpose**: Implementation for Cloudflare Worker-based AI

**Key Features**:
- HTTP requests to Cloudflare Worker endpoint
- Chat history management
- Rate limiting handling
- Error handling and retries
- Free tier quota management

**Configuration**:
- Default endpoint: Environment variable or config
- API key: Optional (if required by worker)
- Request timeout: 30 seconds
- Max retries: 3

#### Local AI Service (`src/ai/local-ai-service.ts`)

**Purpose**: Implementation for NVIDIA Orin-based AI

**Key Features**:
- WebSocket or HTTP connection to local device
- Device discovery (optional)
- Connection health monitoring
- Fallback handling if device unavailable

**Configuration**:
- Device endpoint: User-configurable (IP:port)
- Connection type: WebSocket (preferred) or HTTP
- Heartbeat interval: 30 seconds
- Auto-reconnect: Enabled

#### Non-AI Service (`src/ai/non-ai-service.ts`)

**Purpose**: No-op implementation for non-AI mode

**Key Features**:
- All methods return appropriate "not available" responses
- Minimal overhead
- Used as fallback when AI is disabled

### 3. UI Components

#### Chat Panel Component (`src/components/ai-chat-panel/ai-chat-panel.ts`)

**Purpose**: Reusable chat interface component

**Features**:
- Message input field
- Message history display
- Send button
- Loading indicators
- Error messages
- Auto-scroll to latest message
- Message timestamps

**Integration**:
- Uses `PanelManager` for display
- Listens to AI service events
- Updates in real-time

#### AI Mode Selector (`src/components/ai-mode-selector/ai-mode-selector.ts`)

**Purpose**: Settings UI component for mode selection

**Features**:
- Radio button group for mode selection
- Configuration fields (conditional based on mode)
- Save/Cancel buttons
- Validation
- Help text for each mode

**Integration**:
- Embedded in `ModalProfile`
- Updates `UserPreferences` on save
- Triggers mode change in `AIModeManager`

#### Chat Button (`src/components/ai-chat-button/ai-chat-button.ts`)

**Purpose**: Floating action button or header icon to open chat

**Features**:
- Only visible when AI mode is enabled
- Badge for unread messages (optional)
- Click handler to open chat panel
- Visual state (active/inactive)

**Integration**:
- Added to header or as floating element
- Listens to AI mode changes
- Shows/hides based on current mode

### 4. Cloudflare Worker (New)

#### Worker Structure (`workers/ai-chat-worker/`)

**Purpose**: Serverless AI chat endpoint

**Key Features**:
- Receives chat messages via POST
- Integrates with AI provider (e.g., OpenAI API, Anthropic, or Cloudflare AI)
- Returns AI responses
- Rate limiting (free tier limits)
- CORS handling
- Error handling

**Endpoints**:
- `POST /chat` - Send message, get response
- `GET /health` - Health check
- `GET /status` - Service status

**Configuration**:
- AI provider API key (environment variable)
- Rate limit: 100 requests/day (free tier)
- Max message length: 2000 characters
- Response timeout: 20 seconds

---

## Files to Modify/Create

### New Files to Create

1. **Core AI Services**
   - `src/ai/ai-mode-manager.ts` - Central AI mode coordinator
   - `src/ai/ai-service.ts` - Abstract AI service interface
   - `src/ai/cloud-ai-service.ts` - Cloudflare Worker implementation
   - `src/ai/local-ai-service.ts` - NVIDIA Orin implementation
   - `src/ai/non-ai-service.ts` - No-op implementation
   - `src/ai/types.ts` - AI-related type definitions

2. **UI Components**
   - `src/components/ai-chat-panel/ai-chat-panel.ts` - Chat interface component
   - `src/components/ai-chat-panel/ai-chat-panel.css` - Chat panel styles
   - `src/components/ai-mode-selector/ai-mode-selector.ts` - Mode selection UI
   - `src/components/ai-mode-selector/ai-mode-selector.css` - Selector styles
   - `src/components/ai-chat-button/ai-chat-button.ts` - Chat button component
   - `src/components/ai-chat-button/ai-chat-button.css` - Button styles

3. **Cloudflare Worker** (Future)
   - `workers/ai-chat-worker/index.ts` - Worker entry point
   - `workers/ai-chat-worker/package.json` - Worker dependencies
   - `workers/ai-chat-worker/wrangler.toml` - Worker configuration

4. **Configuration**
   - `.env.example` - Add AI-related environment variables
   - `src/ai/config.ts` - AI configuration constants

### Files to Modify

1. **User Preferences**
   - `src/user-account/types.ts`
     - Extend `UserPreferencesData` interface with AI mode fields
     - Extend `UpdateUserPreferencesRequest` interface

2. **User Data Service**
   - `src/user-account/user-data-service.ts`
     - Add methods to update AI preferences (if needed)
     - Ensure AI preferences are included in preference updates

3. **Profile Modal**
   - `src/user-account/modal-profile.ts`
     - Add AI Settings section to modal content
     - Integrate `AIModeSelector` component
     - Handle AI mode changes

4. **Header Component**
   - `src/pages/layout/header/header.ts`
     - Add AI mode badge indicator
     - Add chat button (conditional)
     - Listen to AI mode changes

5. **App Initialization**
   - `src/app.ts`
     - Initialize `AIModeManager` on app start
     - Load AI mode from user preferences
     - Set up AI service based on saved preference

6. **Webpack Configuration**
   - `webpack.config.js`
     - Add environment variables for AI endpoints
     - Ensure worker files are excluded from main bundle

7. **Package Dependencies**
   - `package.json`
     - Add any required dependencies (e.g., WebSocket client for local AI)

8. **TypeScript Configuration**
   - `tsconfig.json`
     - Ensure new directories are included

### Optional Enhancements

1. **Event System**
   - `src/events/events.ts`
     - Add AI-related events (e.g., `AI_MODE_CHANGED`, `AI_MESSAGE_SENT`)

2. **Error Handling**
   - `src/ai/ai-service-error.ts`
     - Custom error classes for AI service errors

3. **Logging**
   - `src/logging/logger.ts`
     - Add AI-specific logging categories

---

## Technical Specifications

### Cloud AI Implementation

#### Cloudflare Worker Requirements

**Free Tier Limits**:
- 100,000 requests/day
- 10ms CPU time per request (may need optimization)
- 128MB memory
- 50ms execution time (may need to use streaming for longer responses)

**AI Provider Options**:
1. **Cloudflare AI** (Recommended)
   - Built-in, no external API needed
   - Free tier available
   - Low latency
   - Models: @cf/meta/llama-2-7b-chat-int8, @cf/mistai/mistral-7b-instruct-v0.1

2. **OpenAI API** (Alternative)
   - Requires API key
   - Pay-per-use
   - Better quality but costs money

**Worker Code Structure**:
```typescript
// workers/ai-chat-worker/index.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'POST' && request.url.endsWith('/chat')) {
      const { message, history } = await request.json();
      
      // Call Cloudflare AI
      const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
        messages: [
          ...history,
          { role: 'user', content: message }
        ]
      });
      
      return new Response(JSON.stringify({ 
        content: response.response,
        timestamp: Date.now()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }
}
```

**Client Integration**:
- Fetch API calls from `CloudAIService`
- Handle rate limiting (429 responses)
- Implement exponential backoff
- Cache responses if appropriate

### Local AI Implementation

#### NVIDIA Orin Requirements

**Hardware**:
- NVIDIA Jetson Orin device
- Network connectivity (WiFi/Ethernet)
- Running AI inference server

**Software Stack** (To be developed):
- Inference server (e.g., TensorRT, Triton Inference Server)
- REST API or WebSocket server
- Model deployment (e.g., Llama 2, Mistral)

**Connection Protocol**:
1. **WebSocket** (Preferred)
   - Real-time bidirectional communication
   - Lower latency
   - Better for streaming responses

2. **HTTP REST** (Fallback)
   - Simpler implementation
   - Standard request/response
   - Easier to debug

**Device Discovery** (Future):
- mDNS/Bonjour for automatic discovery
- Manual IP entry in settings
- Connection testing before save

**Client Integration**:
- WebSocket client or fetch API
- Connection health monitoring
- Auto-reconnect on disconnect
- Timeout handling

### Non-AI Mode

**Implementation**:
- Simple no-op service
- All AI methods return appropriate "not available" responses
- No network calls
- Minimal resource usage

**UI Behavior**:
- Chat button hidden
- AI-related features disabled
- Traditional UI only

---

## User Experience Flow

### Scenario 1: First-Time User Enabling Cloud AI

1. User opens app → Sees default Non-AI mode
2. User clicks profile button → Profile modal opens
3. User navigates to "AI Settings" section
4. User selects "Cloud AI" radio button
5. User clicks "Save" → Settings saved to database
6. App switches to Cloud AI mode
7. Chat button appears in header
8. User clicks chat button → Chat panel opens
9. User types message → Sends to Cloudflare Worker
10. Response appears in chat → User continues conversation

### Scenario 2: User Switching from Cloud AI to Local AI

1. User is in Cloud AI mode with active chat
2. User opens profile modal → Goes to AI Settings
3. User selects "Local AI" radio button
4. Settings form shows "Local AI Endpoint" field
5. User enters Orin device IP (e.g., `192.168.1.100:8080`)
6. User clicks "Test Connection" → Connection verified
7. User clicks "Save" → Settings saved
8. App switches to Local AI mode
9. Chat panel reconnects to local device
10. Chat history preserved (if supported)

### Scenario 3: User Disabling AI (Non-AI Mode)

1. User is in Cloud AI mode
2. User opens profile modal → Goes to AI Settings
3. User selects "Non-AI Mode" radio button
4. User clicks "Save" → Settings saved
5. App switches to Non-AI mode
6. Chat button disappears from header
7. Any open chat panel closes
8. App returns to traditional UI

### Scenario 4: Local AI Device Unavailable

1. User is in Local AI mode
2. User opens chat → Attempts to connect
3. Connection fails → Error message displayed
4. User sees "Device Unavailable" status
5. User can:
   - Retry connection
   - Switch to Cloud AI mode
   - Switch to Non-AI mode
   - Update device endpoint in settings

---

## Future Considerations

### Phase 2 Enhancements

1. **Chat History Persistence**
   - Save chat history to user preferences
   - Sync across devices
   - Export/import chat logs

2. **Advanced Local AI Features**
   - Device auto-discovery
   - Multiple device support
   - Model selection
   - Performance metrics

3. **Cloud AI Enhancements**
   - Custom prompts/system messages
   - Context awareness (scenario-specific)
   - Multi-turn conversations
   - Voice input/output

4. **Hybrid Mode**
   - Fallback from local to cloud
   - Load balancing between services
   - Cost optimization

5. **Analytics**
   - Usage tracking
   - Performance monitoring
   - Error reporting

### Security Considerations

1. **API Keys**
   - Store securely (environment variables)
   - Never expose in client code
   - Rotate regularly

2. **User Data**
   - Chat messages may contain sensitive information
   - Consider encryption for local AI
   - Privacy policy updates

3. **Rate Limiting**
   - Prevent abuse
   - Fair usage policies
   - User-specific limits

### Performance Optimization

1. **Caching**
   - Cache common responses
   - Reduce API calls
   - Improve latency

2. **Streaming**
   - Stream responses for better UX
   - Show typing indicators
   - Progressive rendering

3. **Connection Pooling**
   - Reuse connections
   - Reduce overhead
   - Improve throughput

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Create AI service interfaces and types
- [ ] Implement `AIModeManager`
- [ ] Extend user preferences data model
- [ ] Create `NonAIService` (no-op)
- [ ] Update profile modal with AI settings UI
- [ ] Add mode selection to user preferences

### Phase 2: Cloud AI (Week 3-4)
- [ ] Create Cloudflare Worker
- [ ] Implement `CloudAIService`
- [ ] Create chat panel component
- [ ] Integrate chat button in header
- [ ] Test Cloud AI end-to-end
- [ ] Handle errors and edge cases

### Phase 3: Local AI (Week 5-6)
- [ ] Design NVIDIA Orin server architecture
- [ ] Implement `LocalAIService`
- [ ] Add device configuration UI
- [ ] Implement connection health monitoring
- [ ] Test local AI integration
- [ ] Document setup process

### Phase 4: Polish & Testing (Week 7-8)
- [ ] UI/UX refinements
- [ ] Error handling improvements
- [ ] Performance optimization
- [ ] Comprehensive testing
- [ ] Documentation
- [ ] User feedback collection

---

## Conclusion

This design provides a flexible, extensible architecture for AI mode selection in SignalRange. The three-tier approach (Cloud, Local, Non-AI) gives users choice while maintaining backward compatibility. The modular design allows for incremental implementation and future enhancements.

Key benefits:
- ✅ User choice and flexibility
- ✅ Backward compatible (defaults to Non-AI)
- ✅ Extensible architecture
- ✅ Clean separation of concerns
- ✅ Reusable components

Next steps:
1. Review and approve design
2. Begin Phase 1 implementation
3. Set up Cloudflare Worker development environment
4. Plan NVIDIA Orin server development

