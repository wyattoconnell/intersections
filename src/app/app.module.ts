import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HttpClientModule } from '@angular/common/http';
import { GameviewComponent } from './gameview/gameview.component';
import { CenterComponent } from './center/center.component';
import { NavbarComponent } from './navbar/navbar.component';
import { InstructionModalComponent } from './instruction-modal/instruction-modal.component';
import { LayeredBtnComponent } from './layered-btn/layered-btn.component';
import { DisplayComponent } from './display/display.component';
import { EndMessageComponent } from './end-message/end-message.component';
import { AdminComponent } from './admin/admin.component';

@NgModule({
  declarations: [
    AppComponent,
    GameviewComponent,
    CenterComponent,
    NavbarComponent,
    InstructionModalComponent,
    LayeredBtnComponent,
    DisplayComponent,
    EndMessageComponent,
    AdminComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    HttpClientModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
