# Quote sources

The decision pop-ups (`ui/np-dialog.js`) close on a quote by a naturalist, chosen by `ui/np-quotes.js` from a pool for
the moment, from a seed of the park and the moment, so the same moment always shows the same line. Each quote is one
text row, `LOC_NP_QUOTE_<POOL>_<n>`, holding the whole display line; the rows are the same in every language, since the
quotes are English originals and a translation would need a named published translator.

## Rules

- **Verified wording.** Every quote was located in a readable copy of its source, and the link below is where it was
  read; each one was matched word for word against the full text. Quote-aggregator sites do not count. Cuts are marked
  with an ellipsis, and a line is never extended past the point its note names.
- **Public domain.** Every work was published before 1930.
- **Sensitivity.** No line demeans a people or praises removing anyone from their land; a line whose next sentence
  turns to people is checked in context.
- **Dates.** The year is the first publication; where the copy read is a later edition, the note says so.

## National Park founded or grown (`PARK`, 8)

| Tag | Quote | Read at | Note |
| --- | --- | --- | --- |
| `PARK_1` | "Everybody needs beauty as well as bread, places to play in and pray in, where Nature may heal and cheer and give strength to body and soul alike." John Muir, The Yosemite (1912) | [The Yosemite](https://www.gutenberg.org/cache/epub/7091/pg7091.txt) | Chapter 16, Hetch Hetchy Valley. Full sentence, no cuts. |
| `PARK_2` | "…mountain parks and reservations are useful not only as fountains of timber and irrigating rivers, but as fountains of life." John Muir, Our National Parks (1901) | [Our National Parks](https://www.gutenberg.org/cache/epub/60929/pg60929.txt) | Chapter I, The Wild Parks and Forest Reservations of the West, opening paragraph. Leading cut drops the first half of the sentence ('Thousands of tired... that wildness is a necessity; and that'). |
| `PARK_3` | "Climb the mountains and get their good tidings. Nature's peace will flow into you as sunshine flows into trees." John Muir, Our National Parks (1901) | [Our National Parks](https://www.gutenberg.org/cache/epub/60929/pg60929.txt) | Chapter II, The Yellowstone National Park. Two full sentences, no cuts. |
| `PARK_4` | "…the wildest health and pleasure grounds accessible and available to tourists seeking escape from care and dust and early death are the parks and reservations of the West." John Muir, Our National Parks (1901) | [Our National Parks](https://www.gutenberg.org/cache/epub/60929/pg60929.txt) | Chapter I. Leading cut drops 'In the meantime,'. |
| `PARK_5` | "…the enjoyment of scenery employs the mind without fatigue and yet exercises it; tranquilizes it and yet enlivens it…" Frederick Law Olmsted, Yosemite and the Mariposa Grove: A Preliminary Report (1865) | [Yosemite and the Mariposa Grove: A Preliminary Report](https://web.archive.org/web/20130115212928/http://www.nps.gov/history/history/online_books/anps/anps_1b.htm) | NPS Park History Program edition (America's National Park System: The Critical Documents, 1b), via Internet Archive snapshot; the live nps.gov URL https://www.nps.gov/parkhistory/online_books/anps/anps_1b.htm no longer serves the text. Leading cut drops 'It therefore results that'; trailing cut before 'and thus, through the influence of the mind over the body...'. Note: the yosemite.ca.us transcription prints a comma, not a semicolon, after 'exercises it'. |
| `PARK_6` | "…the Yosemite should be held, guarded and managed for the free use of the whole body of the people forever…" Frederick Law Olmsted, Yosemite and the Mariposa Grove: A Preliminary Report (1865) | [Yosemite and the Mariposa Grove: A Preliminary Report](https://web.archive.org/web/20130115212928/http://www.nps.gov/history/history/online_books/anps/anps_1b.htm) | Same NPS edition. Paraphrasing the 1864 Act; leading cut drops 'It was in accordance with these views ... that Congress enacted that'; trailing cut. |
| `PARK_7` | "This Park was created, and is now administered, for the benefit and enjoyment of the people." Theodore Roosevelt, Presidential Addresses and State Papers, vol. 1 (1904) | [Presidential Addresses and State Papers, vol. 1](https://www.gutenberg.org/cache/epub/74572/pg74572.txt) | Address at the laying of the cornerstone of the gateway to Yellowstone National Park, Gardiner, Montana, April 24, 1903. Full sentence. |
| `PARK_8` | "No nation has ever fallen for having too much scenery." Enos A. Mills, Your National Parks (1917) | [Your National Parks](https://www.gutenberg.org/cache/epub/42248/pg42248.txt) | Introductory chapter. Full sentence; under 8 words. |

## Wilderness Area founded or grown (`WILD`, 10)

| Tag | Quote | Read at | Note |
| --- | --- | --- | --- |
| `WILD_1` | "…in Wildness is the preservation of the World." Henry David Thoreau, Walking (1862) | [Walking](https://www.gutenberg.org/cache/epub/1022/pg1022.txt) | Leading cut drops 'what I have been preparing to say is, that'. Capitals are Thoreau's. |
| `WILD_2` | "We need the tonic of wildness…" Henry David Thoreau, Walden (1854) | [Walden](https://www.gutenberg.org/cache/epub/205/pg205.txt) | Chapter: Spring. Trailing cut (printed as 'wildness,—to wade sometimes in marshes...'). Short; can be paired with the next sentence-fragment if a longer line is wanted. |
| `WILD_3` | "We can never have enough of Nature." Henry David Thoreau, Walden (1854) | [Walden](https://www.gutenberg.org/cache/epub/205/pg205.txt) | Chapter: Spring, same paragraph as 'the tonic of wildness'. Full sentence. |
| `WILD_4` | "Thousands of tired, nerve-shaken, over-civilized people are beginning to find out that going to the mountains is going home; that wildness is a necessity…" John Muir, Our National Parks (1901) | [Our National Parks](https://www.gutenberg.org/cache/epub/60929/pg60929.txt) | Chapter I, opening paragraph. Trailing cut. |
| `WILD_5` | "None of Nature's landscapes are ugly so long as they are wild…" John Muir, Our National Parks (1901) | [Our National Parks](https://www.gutenberg.org/cache/epub/60929/pg60929.txt) | Chapter I, The Wild Parks and Forest Reservations of the West. Trailing cut at the semicolon. |
| `WILD_6` | "Thus protected, these wildernesses will remain forever wild, forever mysterious and primeval…" Enos A. Mills, Your National Parks (1917) | [Your National Parks](https://www.gutenberg.org/cache/epub/42248/pg42248.txt) | Introductory chapter (on parks as wildlife reservations). Trailing cut. |
| `WILD_7` | "All National Parks are wild-life sanctuaries, places of refuge for birds and animals. There the wild folk are not pursued, trapped, or shot." Enos A. Mills, Your National Parks (1917) | [Your National Parks](https://www.gutenberg.org/cache/epub/42248/pg42248.txt) | Chapter XVII, Wild Life in National Parks. Two full sentences. |
| `WILD_8` | "In the wilderness, I find something more dear and connate than in streets or villages." Ralph Waldo Emerson, Nature (1836) | [Nature](https://www.gutenberg.org/cache/epub/29433/pg29433.txt) | Chapter I, Nature. Full sentence. |
| `WILD_9` | "When we try to pick out anything by itself, we find it hitched to everything else in the universe." John Muir, My First Summer in the Sierra (1911) | [My First Summer in the Sierra](https://www.gutenberg.org/cache/epub/32540/pg32540.txt) | Chapter VI, Mount Hoffman and Lake Tenaya (journal entry July 27). Full sentence. The popular 'hitched to everything else in the Universe' variant is close but this is the printed text. |
| `WILD_10` | "…from so simple a beginning endless forms most beautiful and most wonderful have been, and are being, evolved." Charles Darwin, On the Origin of Species, 1st ed. (1859) | [On the Origin of Species, 1st ed.](https://www.gutenberg.org/cache/epub/1228/pg1228.txt) | Final sentence of Chapter XIV, Recapitulation and Conclusion. Leading cut. |

## No land left to take (`NOLAND`, 5)

| Tag | Quote | Read at | Note |
| --- | --- | --- | --- |
| `NOLAND_1` | "Not the law, but the land sets the limit." Mary Austin, The Land of Little Rain (1903) | [The Land of Little Rain](https://www.gutenberg.org/cache/epub/365/pg365.txt) | Opening chapter, The Land of Little Rain. Full sentence; 9 words. |
| `NOLAND_2` | "The manner of the country makes the usage of life there, and the land will not be lived in except in its own fashion." Mary Austin, The Land of Little Rain (1903) | [The Land of Little Rain](https://www.gutenberg.org/cache/epub/365/pg365.txt) | Chapter: Shoshone Land. Full sentence. |
| `NOLAND_3` | "Let us spend one day as deliberately as Nature, and not be thrown off the track by every nutshell and mosquito's wing that falls on the rails." Henry David Thoreau, Walden (1854) | [Walden](https://www.gutenberg.org/cache/epub/205/pg205.txt) | Chapter: Where I Lived, and What I Lived For. Full sentence. |
| `NOLAND_4` | "Heaven is under our feet as well as over our heads." Henry David Thoreau, Walden (1854) | [Walden](https://www.gutenberg.org/cache/epub/205/pg205.txt) | Chapter: The Pond in Winter. Full sentence. |
| `NOLAND_5` | "The health of the eye seems to demand a horizon. We are never tired, so long as we can see far enough." Ralph Waldo Emerson, Nature (1836) | [Nature](https://www.gutenberg.org/cache/epub/29433/pg29433.txt) | Chapter III, Beauty. Two full sentences. Spare/alternate. |

## Taking worked land for the park (`STRIP`, 5)

| Tag | Quote | Read at | Note |
| --- | --- | --- | --- |
| `STRIP_1` | "Leave it as it is. You can not improve on it. The ages have been at work on it, and man can only mar it." Theodore Roosevelt, Presidential Addresses and State Papers, vol. 1 (1904) | [Presidential Addresses and State Papers, vol. 1](https://www.gutenberg.org/cache/epub/74572/pg74572.txt) | Address at Grand Canyon, Arizona, May 6, 1903. Printed 'can not' as two words (often misquoted as 'cannot'). |
| `STRIP_2` | "Shall I not rejoice also at the abundance of the weeds whose seeds are the granary of the birds?" Henry David Thoreau, Walden (1854) | [Walden](https://www.gutenberg.org/cache/epub/205/pg205.txt) | Chapter: The Bean-Field. Full sentence. |
| `STRIP_3` | "These beans have results which are not harvested by me. Do they not grow for woodchucks partly?" Henry David Thoreau, Walden (1854) | [Walden](https://www.gutenberg.org/cache/epub/205/pg205.txt) | Chapter: The Bean-Field. Two full sentences. |
| `STRIP_4` | "He is to become a co-worker with nature in the reconstruction of the damaged fabric…" George Perkins Marsh, Man and Nature (1864) | [Man and Nature](https://www.gutenberg.org/cache/epub/37957/pg37957.txt) | Chapter I, Introductory, on restoring lands laid waste. Trailing cut (continues 'which the negligence or the wantonness of former lodgers has rendered untenantable'). |
| `STRIP_5` | "Man has too long forgotten that the earth was given to him for usufruct alone, not for consumption, still less for profligate waste." George Perkins Marsh, Man and Nature (1864) | [Man and Nature](https://www.gutenberg.org/cache/epub/37957/pg37957.txt) | Chapter I, Introductory, section 'Destructiveness of Man'. Full sentence. Spare/alternate. |

## Ending an expansion with land unclaimed (`DONE`, 5)

| Tag | Quote | Read at | Note |
| --- | --- | --- | --- |
| `DONE_1` | "…a man is rich in proportion to the number of things which he can afford to let alone." Henry David Thoreau, Walden (1854) | [Walden](https://www.gutenberg.org/cache/epub/205/pg205.txt) | Chapter: Where I Lived, and What I Lived For. Leading cut drops 'and then I let it lie, fallow perchance, for'. |
| `DONE_2` | "I love a broad margin to my life." Henry David Thoreau, Walden (1854) | [Walden](https://www.gutenberg.org/cache/epub/205/pg205.txt) | Chapter: Sounds. Full sentence; under 8 words. |
| `DONE_3` | "…in every walk with Nature one receives far more than he seeks." John Muir, Steep Trails (1918) | [Steep Trails](https://www.gutenberg.org/cache/epub/326/pg326.txt) | Chapter IX, Mormon Lilies. Leading cut drops 'But'. |
| `DONE_4` | "…much, we can say comfortingly, must always be in great part wild, particularly the sea and the sky, the floods of light from the stars…" John Muir, Our National Parks (1901) | [Our National Parks](https://www.gutenberg.org/cache/epub/60929/pg60929.txt) | Chapter I, The Wild Parks and Forest Reservations of the West; follows 'None of Nature's landscapes are ugly so long as they are wild; and'. Trailing cut. |
| `DONE_5` | "When I come back, I go to Nature to be soothed and healed, and to have my senses put in tune once more." John Burroughs, Time and Change (1912) | [Time and Change](https://www.gutenberg.org/cache/epub/5706/pg5706.txt) | Chapter XIII, The Gospel of Nature. Full sentence. Widely misquoted as '...and to have my senses put in order'. |

## Rejected

- Emerson, "Adopt the pace of nature: her secret is patience": the second half is not in *Nature* or either series of
  *Essays*; unverifiable.
- Burroughs, "I go to nature to be soothed and healed, and to have my senses put in order": a misquote; the printed
  line ("put in tune once more", *Time and Change*) is used instead.
- Burroughs, "To find the universal elements enough": not found in six of his books; unverifiable.
- Muir, "No place is too good for good men, and still there is room": verified, but about welcoming immigrants.
- Thoreau, "Why should not we, who have renounced the king's authority, have our national preserves": verified, but
  the cut opens on the American Revolution, which reads oddly in a game of every age and people.
