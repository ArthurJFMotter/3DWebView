import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule, provideAnimations } from '@angular/platform-browser/animations';
import { HttpClientModule } from '@angular/common/http';

import { AppRoutingModule } from './app.routing.module'; 
import { AppComponent } from './app.component';        
import { TopologyViewerComponent } from './pages/topology-viewer/topology-viewer.component';
import { RouterOutlet } from '@angular/router';

import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatToolbarModule} from '@angular/material/toolbar';
import { ThreeSceneService } from './services/tree-scene.service';
import { TopologyStateService } from './services/topology-state.service';

@NgModule({
    declarations: [
        AppComponent,
        TopologyViewerComponent,
    ],
    imports: [
        BrowserModule,            
        BrowserAnimationsModule,
        HttpClientModule,         
        AppRoutingModule,   
        MatButtonModule, 
        MatIconModule,
        MatToolbarModule,
        RouterOutlet,   
    ],
    providers: [ThreeSceneService, TopologyStateService, provideAnimations()],
    bootstrap: [AppComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AppModule { }