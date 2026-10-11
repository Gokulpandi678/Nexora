# Incident Tracker - Design System Reference

## Color Palette (Cool, Modern)

### Background Colors
```
Primary:   #0f172a (Deep slate - main background)
Secondary: #1e293b (Slate-800 - cards, panels)
Tertiary:  #334155 (Slate-700 - hover, input backgrounds)
Hover:     #1e2d42 (Card hover state)
```

### Text Colors
```
Primary:   #f1f5f9 (Slate-100 - main text)
Secondary: #cbd5e1 (Slate-300 - secondary text)
Muted:     #94a3b8 (Slate-400 - helper text)
```

### Accent Colors (Cool Tones)
```
Primary:   #0ea5e9 (Sky-500 - main CTA, highlights)
Secondary: #06b6d4 (Cyan-500 - hover states)
Tertiary:  #8b5cf6 (Violet-500 - alt accent)
Success:   #10b981 (Emerald-500 - positive, resolved)
Warning:   #f59e0b (Amber-500 - caution, in progress)
Danger:    #ef4444 (Red-500 - critical, P1)
```

### Borders
```
Border:    #475569 (Slate-600 - subtle borders)
Overlay:   rgba(15, 23, 42, 0.95) (Semi-transparent base)
```

---

## Typography

### Typeface
- **Font Family**: Inter (system fonts fallback)
- **Mono**: JetBrains Mono (for code/IDs)

### Scale
```
12px - Labels, badges, small text
13px - Body text, form inputs, descriptions
14px - Secondary headings, card titles
16px - Primary headings
18px - Section titles
24px - Page titles (max, usually 20px)
```

### Weights
- **Regular**: 400 (body)
- **Medium**: 500 (secondary labels)
- **Semibold**: 600 (labels, emphasis)
- **Bold**: 700 (headings)
- **Extrabold**: 800 (page title)

### Line Heights
- Labels: 1.2
- Body: 1.5-1.6
- Headings: 1.3

### Line Length
- Max 60-70 characters for optimal readability
- Compact form fields use shorter text blocks

---

## Spacing System (4px baseline)

```
xs:  4px   (0.25rem)
sm:  8px   (0.5rem)  
md:  16px  (1rem)
lg:  24px  (1.5rem)
xl:  32px  (2rem)
2xl: 48px  (3rem)
```

### Application
- **Page padding**: lg (24px)
- **Card padding**: md (16px)
- **Form field padding**: sm + md (8px + 16px = 8px vertical, 16px horizontal)
- **Gap between cards**: md (16px)
- **Margin between sections**: xl (32px)

---

## Component Patterns

### Buttons
```
Primary Button:
- Background: #0ea5e9
- Text: #0f172a (dark text for contrast)
- Padding: 12px 16px (md vertical, md horizontal)
- Font-size: 13px
- Font-weight: 600
- Border-radius: 6px
- Hover: #06b6d4 (lighter cyan)
- Active: scale(0.95) + box-shadow
- Disabled: opacity 0.5, cursor not-allowed

Secondary Button:
- Background: #334155
- Text: #f1f5f9
- Border: 1px solid #475569
- Hover: #475569 background

Ghost Button:
- Background: transparent
- Text: #cbd5e1
- Hover: text #0ea5e9, bg #1e293b
```

### Cards
```
- Background: #1e293b
- Border: 1px solid #475569
- Padding: 12px (compact) to 16px (spacious)
- Border-radius: 8px
- Transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)
- Hover: 
  - Background: #334155
  - Border-color: #0ea5e9
  - Box-shadow: 0 0 20px rgba(14, 165, 233, 0.15)
```

### Form Inputs
```
- Background: #334155
- Border: 1px solid #475569
- Text: #f1f5f9
- Placeholder: #94a3b8
- Padding: 8px 12px (compact spacing)
- Font-size: 13px
- Border-radius: 6px
- Focus: 
  - Border-color: #0ea5e9
  - Ring: 1px solid #0ea5e9
  - Box-shadow: 0 0 12px rgba(14, 165, 233, 0.1)
```

### Badges
```
Success:  bg #10b981/20, text #6ee7b7
Warning:  bg #f59e0b/20, text #fcd34d
Danger:   bg #ef4444/20, text #fca5a5
Info:     bg #0ea5e9/20, text #7dd3fc

Padding: 2px 6px
Font-size: 11px
Border-radius: 4px
Font-weight: 600
```

---

## Layout Patterns

### Incident Form
```
┌─────────────────────────────────────────┐
│ Report Incident                         │
│ Help us track and prevent recurring...  │
├─────────────────────────────────────────┤
│                                         │
│ [Incident Title Input]                  │
│ [Description Textarea]                  │
│ [Symptoms Textarea]                     │
│                                         │
│ [System Selector Buttons] (compact grid)│
│ [Severity Radio: P1 P2 P3]              │
│                                         │
│ [Name Input] [Email Input]              │
│                                         │
│ [Submit Button - Full Width]            │
│                                         │
└─────────────────────────────────────────┘
```

### Incident Match Card
```
┌────────────────────────────────────────┐
│ Database Replication Lag          P2   │
│ Reported by: Rahul Singh               │
├────────────────────────────────────────┤
│ Symptoms: Database replication lagged  │
│ 9 mins during peak load...             │
│                                        │
│ [Yes, same issue] [Different issue]   │
│                                        │
└────────────────────────────────────────┘
```

### Dashboard Header
```
Incident Tracker (Gradient text: cyan to sky)

Reduce recurring issues by learning from past incidents

[+ Report Incident] | [View All Incidents]
────────────────────────────────────────────
```

---

## Interactive States

### Hover
- Cards: brighten background, glow border
- Buttons: change shade, lift (subtle shadow)
- Links: text color to accent, underline optional

### Focus (Keyboard)
- Ring: 2px solid #0ea5e9 with offset
- Clear visual indicator for accessibility

### Active/Selected
- Background: accent color primary
- Text: contrast color
- Scale: 0.95 (slightly compressed)

### Disabled
- Opacity: 0.5
- Cursor: not-allowed
- No hover effects

---

## Animations

### Entrance
```css
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
/* Duration: 0.3s */
/* Timing: cubic-bezier(0.4, 0, 0.2, 1) */
```

### Micro-interactions
- Button press: scale(0.95)
- Card hover: border & shadow change
- Input focus: border color + ring
- **No excessive animations** - kept minimal for professionalism

### Pulse (for alerts)
```css
@keyframes pulse-soft {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```

---

## Responsive Design

### Breakpoints
```
Mobile: <640px
Tablet: 640px - 1024px
Desktop: >1024px
```

### Mobile Adjustments
- Reduce padding/spacing by 1 level (sm instead of md)
- Stack form fields vertically
- Full-width buttons
- Hamburger menu if needed
- Touch targets: min 44px height

---

## Accessibility

### Color Contrast
- Text on background: 4.5:1+ (AA standard)
- Accent on background: 3:1+ (graphics)
- No color-only information (use badges + text)

### Focus States
- All interactive elements have visible focus ring
- Ring color: #0ea5e9
- Ring width: 2px with 2px offset

### Typography
- Minimum 12px font size (smaller in data tables OK)
- Line height 1.5+ for body text
- Don't rely on color alone for meaning

### Semantic HTML
- Proper heading hierarchy (h1, h2, h3)
- Form labels associated with inputs
- ARIA labels for icon-only buttons
- `role="status"` for alerts/notifications

---

## Dark Mode Only
- This is a dark-first design
- No light mode toggle needed
- All colors optimized for dark viewing
- Reduces eye strain for operations/monitoring use

---

## Unique Design Touches

1. **Gradient header**: Cyan → Sky blue text for title
2. **Glow on hover**: Subtle shadow with accent color
3. **Compact spacing**: Dense but not cramped
4. **Cool palette**: No warm tones (unique for incident tracking)
5. **Interactive badges**: Different colors for different states
6. **Smooth transitions**: All interactions feel responsive
7. **Minimal borders**: Only where needed for structure
8. **Purposeful motion**: Only on user actions, not decorative

---

## Avoid These Common Patterns
❌ Warm cream backgrounds
❌ All-caps labels everywhere
❌ Shadowing on every card
❌ Numbered markers (01, 02, 03)
❌ Generic "Submit" buttons
❌ Unnecessary animations
❌ Too many different border-radius values
❌ High contrast pure white text on pure black

---

## Design Files Reference
- **Color System**: COLORS object in design-tokens.ts
- **Spacing**: SPACING object in design-tokens.ts
- **Global Styles**: globals.css (Tailwind + custom)
- **Component Styles**: Inline styles in components (for tight control)
