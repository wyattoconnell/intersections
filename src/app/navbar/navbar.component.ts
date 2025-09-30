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
  @Input() archiveContent: string = "Archive";
  @Output() onOpen = new EventEmitter<boolean>();
  @Output() openArch = new EventEmitter<boolean>();

  revealed = false;

  openModal() {
    this.displayView = !this.displayView;
    this.onOpen.emit(this.displayView);
  }

  openArchiveModal() {
    this.displayView = true;
    this.openArch.emit(this.displayView);
  }

  viewTrue() {
    const btn = document.getElementById("archive-btn");
    if (btn) {
      if (this.displayView == true ) {
        btn.classList.remove('size-adjust');
        btn.style.right = "17px";
        btn.style.top = "34px";
      }
      else if (this.displayView == false) {
        btn.classList.add('size-adjust');
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
  
      el.style.fontWeight = '800'; 
      if (window.innerWidth > 768) {
        el.style.fontSize = `${parseFloat(origSize) * 1.08}px`; 
      }
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


