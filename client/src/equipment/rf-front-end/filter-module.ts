import { FilterState } from './rf-front-end';

export class FilterModule {
  state: FilterState;
  constructor(state: FilterState) {
    this.state = state;
  }
  // Add UI and logic methods here
}
