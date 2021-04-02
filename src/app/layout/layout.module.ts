import { NgModule } from '@angular/core';
import { BaseLayoutComponent } from './base/base.component';
import { SharedModule } from '@shared/shared.module';
import { NavLessLayoutComponent } from './nav-less/nav-less.component';
import { HeaderComponent } from './common/header/header.component';
import { SubnavComponent } from './common/subnav/subnav.component';



@NgModule({
    declarations: [
        BaseLayoutComponent,
        NavLessLayoutComponent,
        HeaderComponent,
        SubnavComponent
    ],
    imports: [
        SharedModule
    ]
})
export class LayoutModule { }