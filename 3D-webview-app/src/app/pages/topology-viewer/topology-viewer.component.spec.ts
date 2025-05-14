import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TopologyViewerComponent } from './topology-viewer.component';

describe('TopologyViewerComponent', () => {
  let component: TopologyViewerComponent;
  let fixture: ComponentFixture<TopologyViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopologyViewerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TopologyViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
