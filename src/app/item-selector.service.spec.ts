import { TestBed } from '@angular/core/testing';

import { ItemSelectorService } from './item-selector.service';

describe('ItemSelectorService', () => {
  let service: ItemSelectorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ItemSelectorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
