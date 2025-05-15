import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TopologyViewerMockComponent } from './topology-viewer-mock.component';

describe('TopologyViewerMockComponent', () => {
  let component: TopologyViewerMockComponent;
  let fixture: ComponentFixture<TopologyViewerMockComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopologyViewerMockComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TopologyViewerMockComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
