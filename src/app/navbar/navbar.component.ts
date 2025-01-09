import { Component, Input, Output, EventEmitter } from '@angular/core';
import { LayeredBtnComponent } from '../layered-btn/layered-btn.component';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent {
  @Input() userScore: number = 0;
  @Input() par: number = 0;
  @Input() shownPar: string = "?";
  @Input() isOpen: boolean = false;
  @Output() onOpen = new EventEmitter<boolean>();

  openModal() {
    this.isOpen = true;
    this.onOpen.emit(this.isOpen);
  }
}


