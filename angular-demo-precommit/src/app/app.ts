import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private  test = 'test';
  protected readonly title = signal('angular-demo-precommit');

  ngOnInit(): void {
    console.log(this.test);
  }
}
