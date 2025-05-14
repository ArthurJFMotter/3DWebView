import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';

const providers = [
  { provide: "LOCALE_ID", useValue: "pt-BR" }
];

platformBrowserDynamic(providers).bootstrapModule(AppModule).catch(err => console.error(err));
