import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TopologyViewerComponent } from './pages/topology-viewer/topology-viewer.component'; 
import { TopologyViewerMockComponent } from './pages/topology-viewer-mock/topology-viewer-mock.component';

const routes: Routes = [
  { path: 'mock', component: TopologyViewerMockComponent },
  { path: 'topology', component: TopologyViewerComponent },
  { path: '', component: TopologyViewerComponent, pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)], 
  exports: [RouterModule]               
})
export class AppRoutingModule { }