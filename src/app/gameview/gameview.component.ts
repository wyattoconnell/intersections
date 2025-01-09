import { Component, ViewChild, ElementRef, OnInit, Renderer2 } from '@angular/core';
import { ROUTER_INITIALIZER } from '@angular/router';
import { DataService } from '../data.service';
import { ItemSelectorService } from '../item-selector.service';
import { InstructionModalComponent } from '../instruction-modal/instruction-modal.component';
import { DisplayComponent } from '../display/display.component';
import { LayeredBtnComponent } from '../layered-btn/layered-btn.component';
import { EndMessageComponent } from '../end-message/end-message.component';

@Component({
  selector: 'app-gameview',
  templateUrl: './gameview.component.html',
  styleUrl: './gameview.component.css',
})
export class GameviewComponent implements OnInit{

  @ViewChild('blue') blue!: ElementRef<HTMLDivElement>;
  @ViewChild('red') red!: ElementRef<HTMLDivElement>;
  @ViewChild('yellow') yellow!: ElementRef<HTMLDivElement>;
  @ViewChild('green') green!: ElementRef<HTMLDivElement>;

  @ViewChild('blueGuesses') blueGuesses!: ElementRef<HTMLDivElement>;
  @ViewChild('redGuesses') redGuesses!: ElementRef<HTMLDivElement>;
  @ViewChild('yellowGuesses') yellowGuesses!: ElementRef<HTMLDivElement>;
  @ViewChild('greenGuesses') greenGuesses!: ElementRef<HTMLDivElement>;

  @ViewChild('bluetext') bluetext!: ElementRef<HTMLElement>;
  @ViewChild('redtext') redtext!: ElementRef<HTMLElement>;
  @ViewChild('yellowtext') yellowtext!: ElementRef<HTMLElement>;
  @ViewChild('greentext') greentext!: ElementRef<HTMLElement>;

  //@ViewChild('play-button') playbutton!: ElementRef<HTMLElement>;

  blueList: string[] = ["", "", ""];
  redList: string[] = ["", "", ""];
  yellowList: string[] = ["", "", ""];
  greenList: string[] = ["", "", ""];

  answerKey: number[] = [0, 0, 0, 0];

  colorMap: { [key: string]: string[] } = {
    'yellow': this.yellowList,
    'red': this.redList,
    'green': this.greenList,
    'blue': this.blueList
  };

  data: any;
  innerText: string = "";
  userScore: number = 0;
  par: number = 0;
  shownPar: string = "?";
  hit: boolean = false;
  isOpen: boolean = false;
  guesses: Array<string> = [];
  answers: Array<string> = [];
  intersections: { [key: string]: string[] } = {};
  found:  { [key: string]: string[] } = {};
  missed:  { [key: string]: string[] } = {};
  gameover: boolean = false;
  displayView: boolean = false;
  showEndMessage: boolean = false;
  showInstructions: boolean = true;
  used: boolean = false;

  constructor(private dataService: DataService, private renderer: Renderer2, private itemSelector: ItemSelectorService) {}

  ngOnInit(): void {
    this.dataService.getData().subscribe(data => {
      this.data = data;

      //calculate minScore
      let res = this.itemSelector.selectEfficientItems(this.data);
      this.answers = res.selectedItems; 
      this.intersections = res.intersections;  
      this.missed = this.intersections;
      this.par = this.answers.length;
    });

    setTimeout(() => {
      let mag = -200;
      this.contract(mag);
    }, 3);
    
  }

  endGame() {
    const green = document.getElementById('green')!;
    const red = document.getElementById('red')!;
    const blue = document.getElementById('blue')!;
    const yellow = document.getElementById('yellow')!;

    setTimeout(() => {
      green.style.opacity = "100%";
      blue.style.opacity = "100%";
      yellow.style.opacity = "100%";
      red.style.opacity = "100%";
    }, 2250);
  }

  revealGame() {
    const playButton = document.getElementById('play-button');
    if (playButton) {
        playButton.style.display = 'none';
    }
    this.toggleTextField("open");
    //this.expand();
    this.expandAtEnd();
  }

  toggleInstructionsDisplay(displayView: boolean) {
    this.displayView = displayView;
    this.showEndMessage = false;
    this.showInstructions = true;
  }

  toggleEndMessageDisplay(displayView: boolean) {
    this.displayView = displayView;
    this.showEndMessage = true;
    this.showInstructions = false;
  }

  toggleDisplay(displayView: boolean) {
    this.displayView = displayView;
    this.showEndMessage = true;
    this.showInstructions = false;
  }

  toggleModal(isOpen: boolean) {
    this.isOpen = isOpen;
  }

  toggleTextField(command: "open" | "close") {
    const target = document.getElementById("text-field");
    if (target) {
      if (command == "open") {
        target.style.display = 'flex';
      }
      else {
        target.style.display = 'none';
      }
    }
  }

  revealPar() {
    this.used = true;
    this.shownPar = this.par.toString();
  }

  select(div: HTMLDivElement, axis: 'x' | 'y', mag: number, opac: string, text: HTMLElement, guesses: HTMLDivElement) {
    text.style.opacity = opac;
    guesses.style.opacity = opac;
    if (axis == 'y') {
      div.style.transform = `translateY(${mag}px)`;
    }
    else if (axis == 'x') {
      div.style.transform = `translateX(${mag}px)`;
    }
  }

  onSubmit() {
    setTimeout(() => {
      const guess = this.innerText.toLowerCase(); 
      this.checkGuess('green', guess);
      this.checkGuess('red', guess);
      this.checkGuess('yellow', guess);
      this.checkGuess('blue', guess);
      if (this.hit) {
        this.guesses.push(guess);
        setTimeout(() => {this.router(-200);}, 0);
        setTimeout(() => this.userScore += 1, 2200);
        setTimeout(() => this.innerText = "", 2250);
        this.hit = false;
      }
      else {
        this.shake();
        setTimeout(() => this.innerText = "", 500);
        setTimeout(() => this.userScore += 1, 500);
      }
    }, 500);
  }

  convertToLowercase(): void {
    this.innerText = this.innerText.toLowerCase();
  }

  shake(): void {
    const elements = [this.blue, this.red, this.yellow, this.green];
    
    elements.forEach(element => {
      if (element) {
        this.renderer.addClass(element.nativeElement, 'shake');
        setTimeout(() => {
          this.renderer.removeClass(element.nativeElement, 'shake');
        }, 800); 
      }
    });
  }

  checkGuess(color: 'green' | 'red' | 'yellow' | 'blue', guess: string) {
    const list = this.colorMap[color];
    const cat = document.getElementById(color)!;
    const items = this.data[color].items;
    guess = guess.trim();

    for (let i = 0; i < items.length; i++) {
      if (guess === items[i].toLowerCase()) {
        items[i] = "boobies";
        this.hit = true;
        list[2] = list[1];
        list[1] = list[0];
        list[0] = guess;
        if (this.checkEnd()) {
          this.gameover = true;
          this.endGame();
        }
        setTimeout(() => {
          if (list[2] !== "" && !this.gameover) {cat.style.opacity = '20%';}
        }, 2250);

        //if an intersection, update variables
        for (const key of Object.keys(this.intersections)) {
          if (key.toLowerCase() === guess) {
            this.found[key] = this.intersections[key];

            if (key in this.missed) {
              delete this.missed[key];
            }

            break; 
          }
        }
      }
    }
  }

  checkEnd() {
    for (const list of Object.values(this.colorMap)) {
      if (list[2] == "") {return false;}
    }
    return true;
  }

  router(mag: number) {
      this.contract(mag);
      if (!this.gameover) {setTimeout(() => {this.expand();}, 2200);}
      else {{setTimeout(() => {this.expandAtEnd();}, 2200);}}
  }

  contract(mag: number) {
    this.select(this.blue.nativeElement, 'y', mag, "0", this.bluetext.nativeElement, this.blueGuesses.nativeElement);
    this.select(this.green.nativeElement, 'y', -1*mag, "0", this.greentext.nativeElement, this.greenGuesses.nativeElement);
    this.select(this.yellow.nativeElement, 'x', mag, "0", this.yellowtext.nativeElement, this.yellowGuesses.nativeElement);
    this.select(this.red.nativeElement, 'x', -1*mag, "0", this.redtext.nativeElement, this.redGuesses.nativeElement);
  }

  expand() {
    this.select(this.blue.nativeElement, 'y', 0, "100", this.bluetext.nativeElement, this.blueGuesses.nativeElement);
    this.select(this.green.nativeElement, 'y', 0, "100", this.greentext.nativeElement, this.greenGuesses.nativeElement);
    this.select(this.yellow.nativeElement, 'x', 0, "100", this.yellowtext.nativeElement, this.yellowGuesses.nativeElement);
    this.select(this.red.nativeElement, 'x', 0, "100", this.redtext.nativeElement, this.redGuesses.nativeElement);
  }

  expandAtEnd() {
    this.toggleTextField("close");
    setTimeout(() => {
      const div = document.getElementById("instructions-div");
      if (div) {
        div.style.display = 'flex';
      }
    }, 1000);
    this.select(this.blue.nativeElement, 'y', 30, "100", this.bluetext.nativeElement, this.blueGuesses.nativeElement);
    this.select(this.green.nativeElement, 'y', -20, "100", this.greentext.nativeElement, this.greenGuesses.nativeElement);
    this.select(this.yellow.nativeElement, 'x', 120, "100", this.yellowtext.nativeElement, this.yellowGuesses.nativeElement);
    this.select(this.red.nativeElement, 'x', -120, "100", this.redtext.nativeElement, this.redGuesses.nativeElement);
  }
}



  // clear() {
  //   this.yellowList = ["", "", ""];
  //   this.greenList = ["", "", ""];
  //   this.blueList = ["", "", ""];
  //   this.redList = ["", "", ""];
  //   this.userScore = 0;
  //   this.guesses = [];

  //   const green = document.getElementById('green')!;
  //   const red = document.getElementById('red')!;
  //   const blue = document.getElementById('blue')!;
  //   const yellow = document.getElementById('yellow')!;
  //   green.style.opacity = "100%";
  //   blue.style.opacity = "100%";
  //   yellow.style.opacity = "100%";
  //   red.style.opacity = "100%";
  // }

  // undo() {
  //   if (this.userScore == 0) {
  //     return;
  //   }
  //   let prev = this.guesses[(this.guesses.length - 1)];
  //   for (let color in this.colorMap) {
  //     if (this.colorMap.hasOwnProperty(color)) {
  //       let list = this.colorMap[color];
  //       for (let item of list) {
  //         if (item === prev) {
  //           list[0] = list[1];
  //           list[1] = list[2];
  //           if (list[2] != "") {
  //             const cat = document.getElementById(color)!;
  //             cat.style.opacity = "100%";
  //           }
  //           list[2] = "";
  //         }
  //       }
  //     }
  //   }
  //   this.userScore -= 1;
  //   this.guesses.pop();
  // }