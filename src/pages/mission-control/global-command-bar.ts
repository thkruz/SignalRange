import { html } from "@app/engine/utils/development/formatter";
import { qs } from "@app/engine/utils/query-selector";

/**
 * CommandBarCenter
 *
 * Displays AOS countdown and an alarm ticker.
 */
export class GlobalCommandBar {
  readonly id = 'global-command-bar-container';
  protected dom_: HTMLElement | null = null;

  constructor(private readonly parentContainerId_: string) {
    this.init_();
  }

  private readonly html_ = html`
    <!-- 1. GLOBAL COMMAND BAR (Top) -->
    <header id="global-command-bar-container" class="app-shell-header shadow-lg">

      <!-- Left: Branding & Clock -->
      <div class="command-bar-left">
        <i class="fa-solid fa-earth-americas text-blue-500 text-xl mr-3"></i>
        <div>
          <div class="font-bold tracking-wide text-white">ORBITAL<span class="text-blue-500">OPS</span></div>
          <div class="text-[10px] text-slate-400 font-mono" id="utc-clock">Loading...</div>
        </div>
      </div>

      <div id="${this.id}" class="command-bar-center">
        <!-- AOS Countdown -->
        <div class="aos-countdown">
          <div class="absolute left-4 flex items-center gap-2 text-xs text-slate-500">
            <span class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">PASS ID: 9942</span>
            <span>SAT: GALAXY-19</span>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-xs text-slate-400 font-medium tracking-widest">NEXT AOS IN</span>
            <span class="text-2xl font-mono font-bold text-white tracking-widest">00:14:32</span>
            <span class="text-[10px] text-slate-500">EL 12.5° RISING</span>
          </div>
        </div>
        <!-- Alarm Ticker -->
        <div class="command-bar-ticker alarm">
          <div class="ticker-wrap w-full"><div class="ticker-move text-[10px] text-red-300 font-mono">
            <span class="ticker-item"><i class="fa-solid fa-triangle-exclamation mr-1"></i> SAT-1: BATTERY VOLTAGE LOW (11.2V)</span>
            <span class="ticker-item"><i class="fa-solid fa-triangle-exclamation mr-1"></i> GROUND-MIA: LNB REF LOST</span>
            <span class="ticker-item"><i class="fa-solid fa-circle-info mr-1"></i> SCHEDULER: PASS CONFLICT RESOVED (SAT-2)</span>
          </div></div>
        </div>
      </div>

      <!-- Right: User & System Status -->
      <div class="command-bar-right">
          <div class="text-right">
              <div class="text-[10px] text-slate-400">NETWORK STATUS</div>
              <div class="flex gap-1">
                  <span class="h-2 w-2 rounded-full bg-green-500"></span>
                  <span class="h-2 w-2 rounded-full bg-green-500"></span>
                  <span class="h-2 w-2 rounded-full bg-slate-700"></span>
              </div>
          </div>
          <div class="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center border border-slate-600">
              <i class="fa-solid fa-user text-slate-400"></i>
          </div>
      </div>
    </header>
  `;

  private init_(): void {
    const parentDom = qs(`#${this.parentContainerId_}`);
    parentDom?.insertAdjacentHTML('beforeend', this.html_);
    this.dom_ = qs(`#${this.id}`, parentDom);
  }
}