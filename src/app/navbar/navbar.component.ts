import { Component, Input, Output, EventEmitter } from '@angular/core';
import { LayeredBtnComponent } from '../layered-btn/layered-btn.component';
import { trigger, transition, animate, keyframes, style } from '@angular/animations';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent {
  @Input() userScore: number = 0;
  @Input() par: number = 0;
  @Input() shownPar: string = "?";
  @Input() displayView: boolean = false;
  @Input() howPlayContent: string = "How Do I Play?";
  @Output() onOpen = new EventEmitter<boolean>();

  revealed = false;

  openModal() {
    this.displayView = !this.displayView;
    this.onOpen.emit(this.displayView);
  }

  viewTrue() {
    if (this.displayView == true) {
      const btn = document.getElementById("how-play-btn");
      if (btn) {
        btn.style.right = "38px";
      }
    }
    else {
      const btn = document.getElementById("how-play-btn");
      if (btn) {
        btn.style.right = "53px";
      }
    }
    return true;
  }

  animate() {
    const el = document.getElementById("perfect-score");
    if (el) {
      if (this.shownPar != "?" && this.revealed == false) {
      this.revealed = true;
      const cs = getComputedStyle(el);
      const origWeight = cs.fontWeight;
      const origSize = cs.fontSize;
      el.style.transition = 'font-size 1s ease, font-weight 1s ease';
  
      el.style.fontWeight = '700'; // or 'bold'
      el.style.fontSize = `${parseFloat(origSize) * 1.08}px`; // ~8% bump
      setTimeout(() => {
        el.style.fontWeight = origWeight as any;
        el.style.fontSize = origSize;
        setTimeout(() => { el.style.transition = ''; }, 1000);
      }, 1000);
      }    
    }
    return true;
  }

}


