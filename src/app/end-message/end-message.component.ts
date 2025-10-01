import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';

@Component({
  selector: 'app-end-message',
  templateUrl: './end-message.component.html',
  styleUrl: './end-message.component.css'
})
export class EndMessageComponent {
  seeDetails: string = "See Details";
  shareResults: string = "Share Results";
  detailsBtn: string = "details-btn";
  shareBtn: string = "share-btn";

  dark: boolean = true;
  @Input() userScore = 0;
  @Input() par = 0;
  @Input() displayView = false;
  @Input() day = "";
  @Input() today = "";
  @Output() openDisplay = new EventEmitter<boolean>();
  closeText:String = "Start Game";
  startBtn:String = "start-btn";

  constructor(private clipboard: Clipboard) {}

  toggleDisplay() {
    this.displayView = !this.displayView;
    this.openDisplay.emit(this.displayView);
  }

  copyResults() {
    let message1 = "";
    let message2 = "";
    if (this.today === this.day) { message1 = "I finished today's Intersections";}
    else { message1 = "I finished Intersections on "+this.day;}
    if (this.userScore == this.par) { message2 = " with a perfect score! Try to match me at https://intersections.in/";}
    else { message2 = " with a score of " + (this.userScore - this.par) + " from perfect! Try to beat me at https://intersections.in/"};
    this.clipboard.copy(message1+message2);
    this.showModal();
  }

  showModal() {
    const modal = document.getElementById('smallModal');
    if (modal) {
      modal.style.display = 'block';
      setTimeout(() => {
        modal.style.display = 'none';
      }, 3000);
    }
  }
}
