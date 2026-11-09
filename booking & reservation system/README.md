# College of Saint Lawrence — CS Lab Reservations

## Where to make changes

| If you want to change… | Edit this file |
| --- | --- |
| Lab names, locations, seats, opening hours, or equipment | `src/data/labs.js` |
| Page colors, glass effects, layout, typography, or responsive styling | `src/styles/main.css` |
| Booking form behavior, validation, approval flow, payment step, reservation passes, or navigation | `src/scripts/app.js` |
| Page sections, labels, footer, or navigation items | `index.html` |

## Project structure

```text
index.html                 Main page structure and text
src/
  data/
    labs.js                 Computer Science laboratory information
  scripts/
    app.js                  Interactive booking and reservation behavior
  styles/
    main.css                All active visual styles and responsive layout
```

When adding a new lab, add its record to `src/data/labs.js`; the dashboard, availability list, and booking form are generated from that catalog.
