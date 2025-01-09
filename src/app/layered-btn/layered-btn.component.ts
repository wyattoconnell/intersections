import { Component, Input, HostListener, OnInit } from '@angular/core';

@Component({
  selector: 'app-layered-btn',
  templateUrl: './layered-btn.component.html',
  styleUrl: './layered-btn.component.css'
})
export class LayeredBtnComponent {
  @Input() content: String = "";
  @Input() dark: boolean = false;
  @Input() icon: boolean = false;
  @Input() used: boolean = false;
  @Input() id: String = "";
  layers = [
      { id: 'layer1', zIndex: '1', color: 'rgb(0, 216, 10)' },
      { id: 'layer2', zIndex: '2', color: '#0CBAF1' },
      { id: 'layer3', zIndex: '3', color: '#FE0606' },
      { id: 'layer4', zIndex: '4', color: '#F2FF00' },
    ];
  

  @HostListener('mouseenter', ['$event'])
  onHover(): void {
    const firstLayer = this.layers.shift(); 
    if (firstLayer) {
      this.layers.push(firstLayer); 
    }

    for (let i = 1; i < 5; i++){
      let target = document.getElementById(this.id+i.toString());
      if (target) {
        target.style.backgroundColor = this.layers[i-1].color;
        target.style.zIndex = this.layers[i-1].zIndex;
      }
    }
  }
}

