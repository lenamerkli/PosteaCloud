import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { SideNav } from '../../component/side-nav/side-nav';

@Component({
  selector: 'app-shell',
  imports: [SideNav, RouterOutlet],
  templateUrl: './shell.html',
  styleUrl: './shell.sass',
})
export class Shell {}