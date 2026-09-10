import { trigger, transition, style, query, animate, group } from '@angular/animations';

/**
 * Page transition animations for route changes
 * Simple crossfade between pages
 */
export const routeAnimations = trigger('routeAnimations', [
  transition('* <=> *', [
    query(':enter, :leave', [
      style({
        position: 'absolute',
        width: '100%',
      })
    ], { optional: true }),
    query(':enter', [
      style({ opacity: 0 })
    ], { optional: true }),
    query(':leave', [
      animate('200ms ease-out', style({ opacity: 0 }))
    ], { optional: true }),
    query(':enter', [
      animate('300ms 100ms ease-in', style({ opacity: 1 }))
    ], { optional: true })
  ])
]);

/**
 * Fade in/out animation for elements
 */
export const fadeIn = trigger('fadeIn', [
  transition(':enter', [
    style({ opacity: 0 }),
    animate('300ms ease-out', style({ opacity: 1 }))
  ]),
  transition(':leave', [
    animate('200ms ease-in', style({ opacity: 0 }))
  ])
]);

/**
 * Fade in and up animation
 */
export const fadeInUp = trigger('fadeInUp', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(20px)' }),
    animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
  ])
]);

/**
 * Fast fade in animation for list items (faster for better performance)
 */
export const fadeInFast = trigger('fadeInFast', [
  transition(':enter', [
    style({ opacity: 0 }),
    animate('150ms ease-out', style({ opacity: 1 }))
  ])
]);

/**
 * Scale in/out animation for cards and modals
 */
export const scaleIn = trigger('scaleIn', [
  transition(':enter', [
    style({ opacity: 0, transform: 'scale(0.95)' }),
    animate('300ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
  ]),
  transition(':leave', [
    animate('200ms ease-in', style({ opacity: 0, transform: 'scale(0.95)' }))
  ])
]);

/**
 * Slide in from right (for notifications)
 */
export const slideInRight = trigger('slideInRight', [
  transition(':enter', [
    style({ transform: 'translateX(100%)', opacity: 0 }),
    animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
  ]),
  transition(':leave', [
    animate('200ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))
  ])
]);

/**
 * List stagger animation - animates list items one after another
 */
export const listStagger = trigger('listStagger', [
  transition('* => *', [
    query(':enter', [
      style({ opacity: 0, transform: 'translateY(10px)' }),
      animate('300ms {{delay}}ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
    ], { optional: true, params: { delay: 50 } })
  ])
]);

/**
 * Expand/collapse animation for accordions
 */
export const expandCollapse = trigger('expandCollapse', [
  transition(':enter', [
    style({ height: 0, opacity: 0 }),
    animate('300ms ease-out', style({ height: '*', opacity: 1 }))
  ]),
  transition(':leave', [
    animate('200ms ease-in', style({ height: 0, opacity: 0 }))
  ])
]);
