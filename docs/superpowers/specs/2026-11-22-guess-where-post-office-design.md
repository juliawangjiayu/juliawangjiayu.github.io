# Guess Where Post Office Shelf Design

## Intent

Make the Guess Where landing page read as one complete playful cover on first load. A desktop visitor should see the title, instructions, all four game modes, the Random rules, and the leaderboard link without scrolling.

## Approved direction

Use a restrained magical post office shelf. Easy, Medium, Hard, and Random each occupy one compartment and are represented by a simple mailbox illustration. The whole compartment remains the game-mode button. A static witch and flight trail pass above the shelf and preserve the existing Guess Where identity.

## Layout and behavior

- Keep the current lavender paper background, rounded display type, gold star accents, witch, and flight trail.
- Tighten the hero so it supports the mode selector instead of pushing it below the fold.
- On desktop, place all four mailbox compartments in one horizontal shelf.
- Label the shelf `Choose one set` so the instruction describes selecting a question set rather than selecting the decorative mailbox itself.
- Put the mode name and short explanation inside each compartment without hiding the click target.
- Show the two Random rules as one compact explanatory strip below the shelf.
- Keep the leaderboard link and current visitor/status messaging available below the strip.
- At narrower widths, reflow the shelf to two columns and then one column. Preserve readable type and touch targets; scrolling is allowed there.
- Do not change game start logic, challenge links, Random progress, leaderboards, or any answer data.

## Considered approaches

- Four freestanding mailboxes: lighter and more scattered, but less visually coherent at the center of a wide desktop screen.
- Mailboxes floating around the title: closer to the Collections leaf composition, but the rectangular forms become busy and weaken scan order.
- Post office shelf: selected because it keeps all four choices immediately comparable and makes the complete first screen feel intentional.

## Validation

Check production-sized desktop viewports, a laptop-height viewport, a two-column tablet layout, and a one-column mobile layout. Confirm that each mode remains a real button and that disabled/busy states are still understandable.
