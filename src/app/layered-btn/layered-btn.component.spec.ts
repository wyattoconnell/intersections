import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LayeredBtnComponent } from './layered-btn.component';

describe('LayeredBtnComponent', () => {
  let component: LayeredBtnComponent;
  let fixture: ComponentFixture<LayeredBtnComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [LayeredBtnComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(LayeredBtnComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
