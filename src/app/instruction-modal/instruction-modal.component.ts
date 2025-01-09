import { Component, Input, Output, EventEmitter } from '@angular/core';
import { LayeredBtnComponent } from '../layered-btn/layered-btn.component';

@Component({
  selector: 'app-instruction-modal',
  templateUrl: './instruction-modal.component.html',
  styleUrl: './instruction-modal.component.css'
})
export class InstructionModalComponent {
  @Input() isOpen = false;
  @Output() onClose = new EventEmitter<boolean>();
  closeText:String = "Start Game";
  startBtn:String = "start-btn";

  close() {
    this.isOpen = false;
    this.onClose.emit(this.isOpen);
  }
}
