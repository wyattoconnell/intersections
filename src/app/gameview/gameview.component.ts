import { Component, ViewChild, ElementRef, OnInit, Renderer2 } from '@angular/core';
import { ROUTER_INITIALIZER } from '@angular/router';
import { DataService, DataSaver } from '../data.service';
import { ItemSelectorService } from '../item-selector.service';
import { InstructionModalComponent } from '../instruction-modal/instruction-modal.component';
import { DisplayComponent } from '../display/display.component';
import { LayeredBtnComponent } from '../layered-btn/layered-btn.component';
import { EndMessageComponent } from '../end-message/end-message.component';
import { PlayState, loadPlayState, savePlayState, clearPlayState, pruneOldStates } from '../play-state.store';
import { NavbarComponent } from '../navbar/navbar.component';

@Component({
  selector: 'app-gameview',
  templateUrl: './gameview.component.html',
  styleUrl: './gameview.component.css',
})

export class GameviewComponent implements OnInit{

  @ViewChild(NavbarComponent) child!: NavbarComponent;
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
  gameDate: string = "";
  source: string = "www.testsource.com";
  gameId: number = 0;
  innerText: string = "";
  userScore: number = 0;
  par: number = 0;
  shownPar: string = "?";
  howPlayContent: string = "How Do I Play?";
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
  showArchive: boolean = true;
  used: boolean = false;
  gameDates: string[] = [];
  day: string = ymdInTZ(new Date("2025, 10, 4"));
  today: string = ymdInTZ(new Date("2025, 10, 4"));


  constructor(private dataService: DataService, private dataSaver: DataSaver, private renderer: Renderer2, private itemSelector: ItemSelectorService) {}

  ngOnInit(): void {

    // this.dataService.getData().subscribe(data => { this.data = data;
    // let res = this.itemSelector.selectEfficientItems(this.data); 
  this.day = this.today;
  this.dataService.getGameByDate(this.day).subscribe(game => {
    this.gameDate = game.game_date;
    this.source = game.source;
    this.data = game.content;
    this.initOrHydrate(this.gameDate);
    const res = this.itemSelector.selectEfficientItems(this.data);
    if (this.guesses.length == 0) {
      this.answers = res.selectedItems; 
      this.intersections = res.intersections; 
      this.missed = this.intersections;
    } 
    else {
      for (const guess of this.guesses) {
        this.checkGuess('green',  guess);
        const greenlist = this.colorMap['green'];
        const greencat = document.getElementById('green')!;
        if (greenlist[2] !== "" && !this.gameover) {greencat.style.opacity = '20%';}
        this.checkGuess('red',    guess);
        const redlist = this.colorMap['red'];
        const redcat = document.getElementById('red')!;
        if (redlist[2] !== "" && !this.gameover) {redcat.style.opacity = '20%';}
        this.checkGuess('yellow', guess);
        const yellowlist = this.colorMap['yellow'];
        const yellowcat = document.getElementById('yellow')!;
        if (yellowlist[2] !== "" && !this.gameover) {yellowcat.style.opacity = '20%';}
        this.checkGuess('blue',   guess); 
        const bluelist = this.colorMap['blue'];
        const bluecat = document.getElementById('blue')!;
        if (bluelist[2] !== "" && !this.gameover) {bluecat.style.opacity = '20%';}   
      }
    }
    
    this.par = this.answers.length; 
    this.saveCurrentState();
    });

    this.dataService.getAllGameDates().subscribe(dates => {
      this.gameDates = dates; 
    });

    setTimeout(() => {
      let mag = -200;
      this.contract(mag);
    }, 25);
    
  }

  endGame() {
    this.hit = false;
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
    if (this.gameover) {this.expandAtEnd();}
    else {this.expand() };
  }

  toggleInstructionsDisplay(displayView: boolean) {
    this.displayView = displayView;
    this.showEndMessage = false;
    this.showArchive = false;
    this.showInstructions = true;
    if (this.howPlayContent == "How Do I Play?"){
      this.howPlayContent = "← Back";
    }
    else {
      this.howPlayContent = "How Do I Play?";
    }
  }

  toggleArchiveDisplay(displayView: boolean) {
    this.displayView = displayView;
    this.showEndMessage = false;
    this.showInstructions = false;
    this.showArchive = true;
    if (displayView){
      this.howPlayContent = "← Back";
    }
    else {
      this.howPlayContent = "How Do I Play?";
    }
  }

  toggleEndMessageDisplay(displayView: boolean) {
    this.displayView = displayView;
    this.showEndMessage = true;
    this.showInstructions = false;
    this.showArchive = false;
    if (this.howPlayContent == "How Do I Play?"){
      this.howPlayContent = "← Back";
    }
    else {
      this.howPlayContent = "How Do I Play?";
    }
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

  loadArchivedDay(ymd: string) {
    this.dataService.getGameByDate(ymd).subscribe(game => {
      this.gameDate = game.game_date;
      this.source = game.source;
      this.data = game.content;
      this.initOrHydrate(this.gameDate);
      this.revealGame();
      if (!this.gameover) {
        const diamond = document.getElementById('diamond');
        if (diamond){
          diamond.classList.remove("mobile-diamond-end");
        }
        const div = document.getElementById("instructions-div");
        if (div) {
          div.style.display = 'none';
        }
      }
      const res = this.itemSelector.selectEfficientItems(this.data);
      this.answers = res.selectedItems; 
      this.intersections = res.intersections; 
      this.missed = this.intersections;
      this.par = this.answers.length; 
      const bluelist = this.colorMap['blue'];
      const greenlist = this.colorMap['green'];
      const yellowlist = this.colorMap['yellow'];
      const redlist = this.colorMap['red'];
      for (let i = 0; i < bluelist.length; i++) {
        bluelist[i]="";
        greenlist[i]="";
        yellowlist[i]="";
        redlist[i]="";
      }
      for (const guess of this.guesses) {
        this.checkGuess('green',  guess);
        const greenlist = this.colorMap['green'];
        const greencat = document.getElementById('green')!;
        if (greenlist[2] !== "" && !this.gameover) {greencat.style.opacity = '20%';}
        this.checkGuess('red',    guess);
        const redlist = this.colorMap['red'];
        const redcat = document.getElementById('red')!;
        if (redlist[2] !== "" && !this.gameover) {redcat.style.opacity = '20%';}
        this.checkGuess('yellow', guess);
        const yellowlist = this.colorMap['yellow'];
        const yellowcat = document.getElementById('yellow')!;
        if (yellowlist[2] !== "" && !this.gameover) {yellowcat.style.opacity = '20%';}
        this.checkGuess('blue',   guess); 
        const bluelist = this.colorMap['blue'];
        const bluecat = document.getElementById('blue')!;
        if (bluelist[2] !== "" && !this.gameover) {bluecat.style.opacity = '20%';}   
      }
      this.saveCurrentState();
      });   
      if (this.used) {this.revealPar()};
      if (!this.used) {this.unrevealPar()}; 
      if (this.howPlayContent == "How Do I Play?"){
        this.howPlayContent = "← Back";
      }
      else {
        this.howPlayContent = "How Do I Play?";
      }
      
  }

  triggerAnimation() {
    this.child.animate();
  }

  revealPar(animate: boolean = false) {
    this.used = true;
    this.saveCurrentState();
    this.par = this.answers.length;
    this.shownPar = this.par.toString();
    let target = document.getElementById("reveal-mobile");
    if (target) {
      target.style.setProperty("opacity", "0.3");
    }
    if (animate) {
      this.triggerAnimation();
    }
  }

  unrevealPar() {
    this.used = false;
    this.saveCurrentState();
    this.shownPar = "?";
    let target = document.getElementById("reveal-mobile");
    if (target) {
      target.style.setProperty("opacity", "1.0");
    }
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
    const guess = this.innerText.toLowerCase();
    this.guesses.push(guess);
    this.saveCurrentState();
    setTimeout(() => {
      const guess = this.innerText.toLowerCase(); 
      this.checkGuess('green', guess);
      this.checkGuess('red', guess);
      this.checkGuess('yellow', guess);
      this.checkGuess('blue', guess);
      if (this.hit) {
        this.hit = false;
        setTimeout(() => {this.router(-200);}, 0);
        setTimeout(() => this.userScore += 1, 2200);
        setTimeout(() => this.innerText = "", 2250);
        setTimeout(() => this.innerText = "", 2250);
      }
      else {
        this.shake();
        setTimeout(() => this.innerText = "", 500);
        setTimeout(() => this.userScore += 1, 500);
      }
      this.saveCurrentState();
    }, 200);
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
        this.saveCurrentState();
        if (this.checkEnd()) {
          this.gameover = true;
          this.dataSaver.savePlayState("", this.gameDate, {
            guesses: this.guesses,
            answers: this.answers,
            intersections: this.intersections,
            found: this.found,
            missed: this.missed,
            gameover: this.gameover,
            used: this.used,
            startedAt: loadPlayState(this.gameDate)?.startedAt ?? new Date().toISOString(),
            lastSavedAt: new Date().toISOString()
          }).subscribe({
            next: (res) => this.endGame(),
            error: (err) => console.error('Save failed', err)
          });
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
            this.saveCurrentState();
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
    this.saveCurrentState();
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
    this.revealPar();
    const diamond = document.getElementById('diamond');
    if (diamond && window.innerWidth < 768){
      diamond.classList.add("mobile-diamond-end");
    }
    setTimeout(() => {
      const div = document.getElementById("instructions-div");
      if (div) {
        div.style.display = 'flex';
      }
    }, 1000);
    
    // Check screen width and apply different positioning
    if (window.innerWidth < 768) {
      // Mobile positioning
      this.select(this.blue.nativeElement, 'y', 60, "100", this.bluetext.nativeElement, this.blueGuesses.nativeElement);
      this.select(this.green.nativeElement, 'y', -10, "100", this.greentext.nativeElement, this.greenGuesses.nativeElement);
      this.select(this.yellow.nativeElement, 'x', 60, "100", this.yellowtext.nativeElement, this.yellowGuesses.nativeElement);
      this.select(this.red.nativeElement, 'x', -60, "100", this.redtext.nativeElement, this.redGuesses.nativeElement);
    } else {
      // Desktop positioning (original values)
      this.select(this.blue.nativeElement, 'y', 30, "100", this.bluetext.nativeElement, this.blueGuesses.nativeElement);
      this.select(this.green.nativeElement, 'y', -20, "100", this.greentext.nativeElement, this.greenGuesses.nativeElement);
      this.select(this.yellow.nativeElement, 'x', 120, "100", this.yellowtext.nativeElement, this.yellowGuesses.nativeElement);
      this.select(this.red.nativeElement, 'x', -120, "100", this.redtext.nativeElement, this.redGuesses.nativeElement);
    }
  }

private initOrHydrate(dateYmd: string) {
  const existing = loadPlayState(dateYmd);
  this.day = dateYmd;
  if (existing) {
    this.guesses = existing.guesses ?? [];
    this.userScore = this.guesses.length;
    this.used = existing.used;
    this.answers = existing.answers ?? [];
    this.par = this.answers.length;
    if (this.used) {
      this.shownPar = this.par.toString();
      this.revealPar();
    }
    if (!this.used) {
      this.shownPar = "?";
      this.unrevealPar();
    }
    this.answers = existing.answers ?? [];
    this.par = this.answers.length;
    this.intersections = existing.intersections ?? {};
    this.found = existing.found ?? {};
    this.missed = existing.missed ?? {};
    this.gameover = !!existing.gameover;
  } else {
    // fresh state for the day
    //console.log("initializing game state..");
    this.guesses = [];
    this.answers = [];
    this.intersections = {};
    this.found = {};
    this.missed = {};
    this.gameover = false;
    this.unrevealPar();
    this.userScore = 0;

    savePlayState(dateYmd, {
      guesses: this.guesses,
      answers: this.answers,
      intersections: this.intersections,
      found: this.found,
      missed: this.missed,
      gameover: this.gameover,
      used: this.used,
      startedAt: new Date().toISOString(),
      lastSavedAt: new Date().toISOString()
    });
  }
  pruneOldStates(30);
}

private saveCurrentState() {
  if (!this.gameDate) return;
  savePlayState(this.gameDate, {
    guesses: this.guesses,
    answers: this.answers,
    intersections: this.intersections,
    found: this.found,
    missed: this.missed,
    gameover: this.gameover,
    used: this.used,
    startedAt: loadPlayState(this.gameDate)?.startedAt ?? new Date().toISOString(),
    lastSavedAt: new Date().toISOString()
  });
}
}

export function ymdInTZ(
  date: Date = new Date(),
  timeZone: string = 'America/Los_Angeles'
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`; // e.g., '2025-09-30'
}

