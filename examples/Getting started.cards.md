# Getting started

Every `## ` heading below is a card: the heading is the question, the lines under it are the
answer. This file is an ordinary note, so it reads the same in Obsidian, on GitHub or in any editor.

## What makes a heading a card?
A level-2 heading (`## `). Everything under it, up to the next `##` or `#` heading, is the answer.

### Smaller headings
Headings of level 3 and deeper stay inside the card's answer, like this one.

## Where does the review state go?
Into this file, as one comment line right under the card's heading:

```md
## Where does the review state go?
<!-- srs: review due=2026-11-02T10:04:31Z last=2026-10-29T10:04:31Z s=4.1312 d=5.2341 reps=2 lapses=0 -->
```

Obsidian's reading view, GitHub and Markdown previews hide it. A card without one is new.

## How do I ask a question longer than a heading?
Write the rest of the question under the heading and end it with a line that holds only `?`. The
lines above the `?` are shown with the question, the lines below it are the answer.

## What does this print?
```js
console.log([1, 2, 3].map(parseInt));
```
?
`[1, NaN, NaN]`. `map` calls `parseInt(value, index)`: radix 0 means 10, radix 1 is invalid and
radix 2 has no digit `3`.

## Which ratings are there?
- **Again**: you did not know it. It comes back in a few minutes.
- **Hard**: you knew it, with effort.
- **Good**: you knew it.
- **Easy**: too easy. It waits longer.

`Space` shows the answer, then `Space` again is Good and `1` to `4` rate. `Ctrl+Z` (`⌘Z` on a
Mac) takes the last rating back.

## What is the cost of a lookup in a hash map?
O(1) on average, O(n) in the worst case: every key in the same bucket.

## TCP or UDP?
| | TCP | UDP |
| --- | --- | --- |
| Connection | yes, a handshake first | none |
| Delivery | reliable and in order | best effort |
| Used by | HTTP/1.1, HTTP/2, SSH | DNS, QUIC, video calls |

## What does SQ3R stand for?
**S**urvey, **Q**uestion, **R**ead, **R**ecite, **R**eview: a way to read a technical text actively.

> [!tip] From reading to cards
> Turn each section heading into a question before you read it. After the Recite step, that
> question and your answer make a good card.
