import { Component, ViewChild, ElementRef, OnInit, Renderer2 } from '@angular/core';
import { ROUTER_INITIALIZER } from '@angular/router';
import { DataService } from '../data.service';
import { ItemSelectorService } from '../item-selector.service';
import { CategoryComponent } from '../category/category.component';

@Component({
  selector: 'app-gameview',
  templateUrl: './gameview.component.html',
  styleUrl: './gameview.component.css'
})
export class GameviewComponent {
  //figure out getElementbyID() so all of this junk can be eliminated


  @ViewChild('blue') blue!: ElementRef<HTMLDivElement>;
  @ViewChild('red') red!: ElementRef<HTMLDivElement>;
  @ViewChild('yellow') yellow!: ElementRef<HTMLDivElement>;
  @ViewChild('green') green!: ElementRef<HTMLDivElement>;

  // blue: HTMLElement = document.getElementById("blue")!;
  // red: HTMLElement = document.getElementById("red")!;
  // yellow: HTMLElement = document.getElementById("yellow")!;
  // green: HTMLElement = document.getElementById("green")!;

  @ViewChild('blueGuesses') blueGuesses!: ElementRef<HTMLDivElement>;
  @ViewChild('redGuesses') redGuesses!: ElementRef<HTMLDivElement>;
  @ViewChild('yellowGuesses') yellowGuesses!: ElementRef<HTMLDivElement>;
  @ViewChild('greenGuesses') greenGuesses!: ElementRef<HTMLDivElement>;

  @ViewChild('bluetext') bluetext!: ElementRef<HTMLElement>;
  @ViewChild('redtext') redtext!: ElementRef<HTMLElement>;
  @ViewChild('yellowtext') yellowtext!: ElementRef<HTMLElement>;
  @ViewChild('greentext') greentext!: ElementRef<HTMLElement>;

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

  // catMap: { [key: string]: HTMLDivElement } = {
  //   'yellow': this.yellow.nativeElement,
  //   'red': this.red.nativeElement,
  //   'green': this.green.nativeElement,
  //   'blue': this.blue.nativeElement
  // };

  data: any;
  innerText: string = "";
  userScore: number = 0;
  minScore: number = 12;
  hit: boolean = false;
  guesses: Array<string> = [];
  answers: Array<string> = [];


  constructor(private dataService: DataService, private renderer: Renderer2, private itemSelector: ItemSelectorService) {}

  ngOnInit(): void {
    this.dataService.getData().subscribe(data => {
      this.data = data;

    //calculate minScore
    this.answers = this.itemSelector.selectEfficientItems(this.data);
    console.log(this.answers);
    this.minScore = this.answers.length;

    });
  }

  clear() {
    this.yellowList = ["", "", ""];
    this.greenList = ["", "", ""];
    this.blueList = ["", "", ""];
    this.redList = ["", "", ""];
    this.userScore = 0;
  }

  undo() {
    if (this.userScore == 0) {
      return;
    }
    let prev = this.guesses[(this.guesses.length - 1)];
    for (let color in this.colorMap) {
      if (this.colorMap.hasOwnProperty(color)) {
        let list = this.colorMap[color];
        for (let item of list) {
          if (item === prev) {
            list[0] = list[1];
            list[1] = list[2]
            list[2] = "";
          }
        }
      }
    }
    this.userScore -= 1;
    this.guesses.pop();
  }

  select(div: HTMLDivElement, axis: 'x' | 'y', mag: number, opac: string, text: HTMLElement, guesses: HTMLDivElement) {
    text.style.opacity = opac;
    guesses.style.opacity = opac;
    if (axis == 'y') {
      div.style.transform = `translateY(${mag}px)`;
    }
    else {
      div.style.transform = `translateX(${mag}px)`;
    }
  }

  onSubmit() {
    const guess = this.innerText.toLowerCase(); 
    this.checkGuess('green', guess);
    this.checkGuess('red', guess);
    this.checkGuess('yellow', guess);
    this.checkGuess('blue', guess);
    if (this.hit) {
      this.guesses.push(guess);
      setTimeout(() => {this.router(-195);}, 500);
      setTimeout(() => this.userScore += 1, 2700);
      setTimeout(() => this.innerText = "", 2750);
      this.hit = false;
    }
    else {
      this.shake();
      setTimeout(() => this.innerText = "", 500);
      //lose life
    }
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

    for (let i = 0; i < items.length; i++) {
      if (guess === items[i].toLowerCase()) {
        this.hit = true;
        setTimeout(() => {
          list[2] = list[1];
          list[1] = list[0];
          list[0] = guess;
          if (list[2] !== "") {cat.style.opacity = '50%';}
        }, 2750)
      }
    }
  }

  router(mag: number) {
      this.select(this.blue.nativeElement, 'y', mag, "0", this.bluetext.nativeElement, this.blueGuesses.nativeElement);
      this.select(this.green.nativeElement, 'y', -1*mag, "0", this.greentext.nativeElement, this.greenGuesses.nativeElement);
      this.select(this.yellow.nativeElement, 'x', mag, "0", this.yellowtext.nativeElement, this.yellowGuesses.nativeElement);
      this.select(this.red.nativeElement, 'x', -1*mag, "0", this.redtext.nativeElement, this.redGuesses.nativeElement);

      setTimeout(() => {this.select(this.blue.nativeElement, 'y', 0, "100", this.bluetext.nativeElement, this.blueGuesses.nativeElement);}, 2200);
      setTimeout(() => {this.select(this.green.nativeElement, 'y', 0, "100", this.greentext.nativeElement, this.greenGuesses.nativeElement);}, 2200);
      setTimeout(() => {this.select(this.yellow.nativeElement, 'x', 0, "100", this.yellowtext.nativeElement, this.yellowGuesses.nativeElement);}, 2200);
      setTimeout(() => {this.select(this.red.nativeElement, 'x', 0, "100", this.redtext.nativeElement, this.redGuesses.nativeElement);}, 2200);
  }
}
