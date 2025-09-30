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
  @Input() source = "";
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

  // getKeys(dictionary: { [key: string]: string[] }): string[] {

  //   return Object.keys(dictionary);
  // }  

  getKeys(
    dictionary: Record<string, string[]>
  ): string[] {
    const lexicographicCompare = (a: string[] = [], b: string[] = []) => {
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) {
        const cmp = (a[i] ?? '').localeCompare(b[i] ?? '');
        if (cmp !== 0) return cmp;           
      }
      return a.length - b.length;            
    };
  
    return Object.keys(dictionary).sort((ka, kb) => {
      const la = dictionary[ka]?.length ?? 0;
      const lb = dictionary[kb]?.length ?? 0;
  
      if (la !== lb) return lb - la;        
      return lexicographicCompare(dictionary[ka], dictionary[kb]); 
    });
  }
  
  
}
