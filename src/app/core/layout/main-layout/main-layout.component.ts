import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { MenubarModule } from 'primeng/menubar';
import { MenuModule } from 'primeng/menu';
import { SidebarModule } from 'primeng/sidebar';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, MenubarModule, MenuModule, SidebarModule, ButtonModule],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss']
})
export class MainLayoutComponent implements OnInit {
  sidebarVisible: boolean = true;
  sidebarItems: MenuItem[] | undefined;

  ngOnInit() {
    this.sidebarItems = [
      { label: 'Dashboard', icon: 'pi pi-fw pi-home', routerLink: '/dashboard' },
      { label: 'Sales', icon: 'pi pi-fw pi-chart-line', routerLink: '/sales' },
      { label: 'Inventory', icon: 'pi pi-fw pi-box', routerLink: '/inventory' },
      { label: 'Settings', icon: 'pi pi-fw pi-cog', routerLink: '/settings' }
    ];
  }

  toggleSidebar() {
    this.sidebarVisible = !this.sidebarVisible;
  }
}
