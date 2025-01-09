import { Component, Input, Output, EventEmitter } from '@angular/core';
import { LayeredBtnComponent } from '../layered-btn/layered-btn.component';

@Component({
  selector: 'app-display',
  templateUrl: './display.component.html',
  styleUrl: './display.component.css'
})
export class DisplayComponent {

  colorMap: { [key: string]: string } = {
    red: '#FE0606', 
    blue: '#0CBAF1',
    green: 'rgb(0, 216, 10)',
    yellow: '#F2FF00'
  };  

  @Input() userScore = 0;
  @Input() par = 0;
  @Input() found:  { [key: string]: string[] } = {};
  @Input() missed:  { [key: string]: string[] } = {};
  @Input() displayView = false;
  @Input() showEndMessage = false;
  @Input() showInstructions = true;
  @Output() openDisplay = new EventEmitter<boolean>();


  toggleDisplay() {
    this.displayView = !this.displayView;
    this.openDisplay.emit(this.displayView);
  }

  toLowerCase(word: string) {
    return word.toLowerCase()
  }

  getKeys(dictionary: { [key: string]: string[] }): string[] {
    return Object.keys(dictionary);
  }  
}
