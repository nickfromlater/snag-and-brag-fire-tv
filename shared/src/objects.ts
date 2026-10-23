/** Exact OBJ metadata from reference/src/art.js. SVG and house placement belong to the art worker. */
export type ObjectTrait = 'loot' | 'old' | 'tough' | 'isle' | 'weird' | 'museum';
export interface GameObject {
  id: string; nm: string; col: string; t: Record<ObjectTrait, number>;
  eyes: [[number, number], [number, number], number]; names: string[]; brags: string[];
}
export const OBJ: readonly GameObject[] = [
  {
    "id": "portrait",
    "nm": "Grandpa portrait",
    "col": "#F2B533",
    "t": {
      "loot": 6,
      "old": 10,
      "tough": 2,
      "isle": 3,
      "weird": 6,
      "museum": 10
    },
    "eyes": [
      [
        50,
        51
      ],
      [
        70,
        51
      ],
      6
    ],
    "names": [
      "Great Uncle Mort",
      "The Colonel",
      "Mustache Max"
    ],
    "brags": [
      "Has watched this family for 40 years. Judging.",
      "Eyes follow you. Respectfully."
    ]
  },
  {
    "id": "cactus",
    "nm": "Cactus",
    "col": "#3BB54A",
    "t": {
      "loot": 1,
      "old": 5,
      "tough": 8,
      "isle": 8,
      "weird": 4,
      "museum": 3
    },
    "eyes": [
      [
        53,
        52
      ],
      [
        67,
        52
      ],
      6
    ],
    "names": [
      "Pokey",
      "Sir Spikes",
      "Hugh Jabbs"
    ],
    "brags": [
      "Watered once in 2023. Thriving.",
      "Do not hug. Do respect."
    ]
  },
  {
    "id": "record",
    "nm": "Vinyl record",
    "col": "#26223B",
    "t": {
      "loot": 6,
      "old": 9,
      "tough": 2,
      "isle": 3,
      "weird": 3,
      "museum": 8
    },
    "eyes": [
      [
        44,
        46
      ],
      [
        76,
        46
      ],
      9
    ],
    "names": [
      "DJ Spin",
      "Vinny Vinyl",
      "Groove Holmes"
    ],
    "brags": [
      "Older than everyone in this room. Still spinning.",
      "Has a B-side you are not ready for."
    ]
  },
  {
    "id": "lava",
    "nm": "Lava lamp",
    "col": "#FF8BC4",
    "t": {
      "loot": 4,
      "old": 7,
      "tough": 2,
      "isle": 3,
      "weird": 9,
      "museum": 7
    },
    "eyes": [
      [
        53,
        50
      ],
      [
        67,
        50
      ],
      6
    ],
    "names": [
      "Groovy Gloria",
      "The Blobfather",
      "Lava Lynn"
    ],
    "brags": [
      "Bubbling since the 70s. Refuses to stop.",
      "Mood: always."
    ]
  },
  {
    "id": "book",
    "nm": "Giant dictionary",
    "col": "#2E5BFF",
    "t": {
      "loot": 3,
      "old": 8,
      "tough": 6,
      "isle": 6,
      "weird": 2,
      "museum": 6
    },
    "eyes": [
      [
        48,
        74
      ],
      [
        68,
        74
      ],
      9
    ],
    "names": [
      "Professor Pages",
      "Wordsworth",
      "The Big Book"
    ],
    "brags": [
      "Knows every word. Says none.",
      "Heavier than your excuses."
    ]
  },
  {
    "id": "pillow",
    "nm": "Throw pillow",
    "col": "#FF8A2A",
    "t": {
      "loot": 1,
      "old": 3,
      "tough": 1,
      "isle": 7,
      "weird": 2,
      "museum": 1
    },
    "eyes": [
      [
        46,
        52
      ],
      [
        72,
        52
      ],
      9
    ],
    "names": [
      "Fluffy McPuff",
      "Cushion Cassidy",
      "Pillow Talk"
    ],
    "brags": [
      "Has absorbed 400 naps and counting.",
      "Soft. Dangerous in a pillow fight."
    ]
  },
  {
    "id": "remote",
    "nm": "TV remote",
    "col": "#454A6E",
    "t": {
      "loot": 3,
      "old": 4,
      "tough": 3,
      "isle": 1,
      "weird": 3,
      "museum": 2
    },
    "eyes": [
      [
        59,
        38
      ],
      [
        77,
        46
      ],
      6
    ],
    "names": [
      "Remote Ronnie",
      "The Clicker",
      "Channel Chad"
    ],
    "brags": [
      "Went missing for 3 days. Found in the fridge.",
      "Controls everything here except the cat."
    ]
  },
  {
    "id": "mug",
    "nm": "Coffee mug",
    "col": "#EC4434",
    "t": {
      "loot": 2,
      "old": 5,
      "tough": 3,
      "isle": 6,
      "weird": 2,
      "museum": 3
    },
    "eyes": [
      [
        42,
        68
      ],
      [
        62,
        68
      ],
      9
    ],
    "names": [
      "Mugsy Malone",
      "Sir Sips-a-Lot",
      "Morning Menace"
    ],
    "brags": [
      "Survived 4 dishwashers and one toddler.",
      "Holds coffee. Holds grudges."
    ]
  },
  {
    "id": "sock",
    "nm": "Lone sock",
    "col": "#3FE0D0",
    "t": {
      "loot": 1,
      "old": 4,
      "tough": 1,
      "isle": 2,
      "weird": 10,
      "museum": 4
    },
    "eyes": [
      [
        52,
        40
      ],
      [
        66,
        40
      ],
      7
    ],
    "names": [
      "Lonely Larry",
      "Sockrates",
      "Solo Sock"
    ],
    "brags": [
      "Its partner left in 2022. It is thriving.",
      "Smells like victory. Mostly."
    ]
  },
  {
    "id": "controller",
    "nm": "Game controller",
    "col": "#8B5CFF",
    "t": {
      "loot": 5,
      "old": 3,
      "tough": 3,
      "isle": 4,
      "weird": 2,
      "museum": 4
    },
    "eyes": [
      [
        54,
        58
      ],
      [
        66,
        58
      ],
      6
    ],
    "names": [
      "Player Two",
      "Button Masher",
      "Joy Stickney"
    ],
    "brags": [
      "Beat every boss except bedtime.",
      "Mashed so hard it has calluses."
    ]
  },
  {
    "id": "banana",
    "nm": "Banana",
    "col": "#FFD43B",
    "t": {
      "loot": 1,
      "old": 1,
      "tough": 1,
      "isle": 7,
      "weird": 5,
      "museum": 1
    },
    "eyes": [
      [
        50,
        72
      ],
      [
        66,
        79
      ],
      8
    ],
    "names": [
      "Slippy Pete",
      "Bananathan",
      "The Curve"
    ],
    "brags": [
      "Peak potassium. Peak drama.",
      "Ripe for greatness. By Thursday."
    ]
  },
  {
    "id": "tomato",
    "nm": "Tomato",
    "col": "#F23B2E",
    "t": {
      "loot": 1,
      "old": 1,
      "tough": 1,
      "isle": 5,
      "weird": 3,
      "museum": 1
    },
    "eyes": [
      [
        46,
        72
      ],
      [
        72,
        72
      ],
      9
    ],
    "names": [
      "Tomato Montana",
      "Lil Saucy",
      "Big Red"
    ],
    "brags": [
      "Technically a fruit. Emotionally a vegetable.",
      "100% splat rate."
    ]
  },
  {
    "id": "kettle",
    "nm": "Whistling kettle",
    "col": "#FF7A1F",
    "t": {
      "loot": 3,
      "old": 6,
      "tough": 5,
      "isle": 6,
      "weird": 3,
      "museum": 4
    },
    "eyes": [
      [
        48,
        74
      ],
      [
        70,
        74
      ],
      8
    ],
    "names": [
      "Steamy Steve",
      "Kettle Kate",
      "The Whistler"
    ],
    "brags": [
      "Screams every morning so you do not have to.",
      "Hot-headed, in a fun way."
    ]
  },
  {
    "id": "cheese",
    "nm": "Swiss cheese",
    "col": "#FFC62B",
    "t": {
      "loot": 4,
      "old": 6,
      "tough": 1,
      "isle": 6,
      "weird": 4,
      "museum": 2
    },
    "eyes": [
      [
        56,
        84
      ],
      [
        76,
        76
      ],
      7
    ],
    "names": [
      "Holey Moley",
      "The Big Cheese",
      "Cheddar Wedder"
    ],
    "brags": [
      "Full of holes. Not one in its story.",
      "Aged 6 months. Still not tired."
    ]
  },
  {
    "id": "donut",
    "nm": "Frosted donut",
    "col": "#FF8BC4",
    "t": {
      "loot": 3,
      "old": 1,
      "tough": 1,
      "isle": 4,
      "weird": 3,
      "museum": 2
    },
    "eyes": [
      [
        44,
        38
      ],
      [
        76,
        38
      ],
      8
    ],
    "names": [
      "Sprinkles McGee",
      "Donut Disturb",
      "Sir Glazealot"
    ],
    "brags": [
      "Sweet outside. Sweet inside. No middle.",
      "The hole is a feature."
    ]
  },
  {
    "id": "whisk",
    "nm": "Whisk",
    "col": "#D5DBEE",
    "t": {
      "loot": 2,
      "old": 3,
      "tough": 2,
      "isle": 3,
      "weird": 6,
      "museum": 2
    },
    "eyes": [
      [
        52,
        38
      ],
      [
        68,
        38
      ],
      7
    ],
    "names": [
      "Sir Whiskers",
      "Twirly Shirley",
      "The Tornado"
    ],
    "brags": [
      "Whipped more cream than you have had birthdays.",
      "Spins faster than gossip."
    ]
  },
  {
    "id": "spatula",
    "nm": "Spatula",
    "col": "#3BB54A",
    "t": {
      "loot": 1,
      "old": 3,
      "tough": 6,
      "isle": 5,
      "weird": 3,
      "museum": 2
    },
    "eyes": [
      [
        35,
        39
      ],
      [
        53,
        29
      ],
      7
    ],
    "names": [
      "Flip Johnson",
      "Spatricia",
      "The Flipper"
    ],
    "brags": [
      "Flipped 1,000 pancakes. Zero regrets.",
      "Gets you out of sticky situations."
    ]
  },
  {
    "id": "pan",
    "nm": "Frying pan",
    "col": "#3A3561",
    "t": {
      "loot": 3,
      "old": 6,
      "tough": 10,
      "isle": 8,
      "weird": 2,
      "museum": 3
    },
    "eyes": [
      [
        38,
        70
      ],
      [
        58,
        62
      ],
      7
    ],
    "names": [
      "Pan Solo",
      "Sir Sizzle",
      "Frying Ryan"
    ],
    "brags": [
      "Cast iron. Iron will.",
      "Has been in more cartoon fights than anyone."
    ]
  },
  {
    "id": "glove",
    "nm": "Rubber glove",
    "col": "#FF6FB5",
    "t": {
      "loot": 1,
      "old": 2,
      "tough": 3,
      "isle": 4,
      "weird": 7,
      "museum": 2
    },
    "eyes": [
      [
        50,
        72
      ],
      [
        64,
        72
      ],
      7
    ],
    "names": [
      "Glove Actually",
      "Pinky",
      "High Five Hal"
    ],
    "brags": [
      "Has touched things you do not want to know about.",
      "Always ready for a high five."
    ]
  },
  {
    "id": "cereal",
    "nm": "Cereal box",
    "col": "#2E6BFF",
    "t": {
      "loot": 2,
      "old": 2,
      "tough": 2,
      "isle": 6,
      "weird": 3,
      "museum": 2
    },
    "eyes": [
      [
        42,
        64
      ],
      [
        62,
        64
      ],
      8
    ],
    "names": [
      "Sergeant Crunch",
      "Breakfast Barry",
      "The Box Office"
    ],
    "brags": [
      "Part of a complete breakfast. The fun part.",
      "Prize inside. Allegedly."
    ]
  },
  {
    "id": "rocket",
    "nm": "Toy rocket",
    "col": "#F23B2E",
    "t": {
      "loot": 5,
      "old": 4,
      "tough": 4,
      "isle": 3,
      "weird": 4,
      "museum": 7
    },
    "eyes": [
      [
        52,
        64
      ],
      [
        68,
        64
      ],
      7
    ],
    "names": [
      "Captain Liftoff",
      "Rocket Hank",
      "Commander Whoosh"
    ],
    "brags": [
      "Been to space twice. Both times under the bed.",
      "Fastest thing here after the cat."
    ]
  },
  {
    "id": "robot",
    "nm": "Wind-up robot",
    "col": "#7F9BFF",
    "t": {
      "loot": 4,
      "old": 6,
      "tough": 6,
      "isle": 5,
      "weird": 6,
      "museum": 6
    },
    "eyes": [
      [
        50,
        34
      ],
      [
        70,
        34
      ],
      8
    ],
    "names": [
      "Bolt Robbins",
      "Clank Hanks",
      "Unit 7"
    ],
    "brags": [
      "Walks into walls with total confidence.",
      "Will not take over the world. Probably."
    ]
  },
  {
    "id": "dino",
    "nm": "Toy dinosaur",
    "col": "#7ED957",
    "t": {
      "loot": 3,
      "old": 9,
      "tough": 8,
      "isle": 4,
      "weird": 6,
      "museum": 6
    },
    "eyes": [
      [
        86,
        24
      ],
      [
        98,
        24
      ],
      6
    ],
    "names": [
      "Rex Mundy",
      "Chompers",
      "Tiny Arms Tony"
    ],
    "brags": [
      "Survived an asteroid and a toy box.",
      "Tiny arms. Huge ambitions."
    ]
  },
  {
    "id": "teddy",
    "nm": "Teddy bear",
    "col": "#B87A4B",
    "t": {
      "loot": 3,
      "old": 8,
      "tough": 3,
      "isle": 9,
      "weird": 2,
      "museum": 5
    },
    "eyes": [
      [
        50,
        38
      ],
      [
        70,
        38
      ],
      7
    ],
    "names": [
      "Mr. Snuggles",
      "Sir Hugsby",
      "Bearnard"
    ],
    "brags": [
      "Has heard every secret in this house.",
      "Missing one button. Fears nothing."
    ]
  },
  {
    "id": "crown",
    "nm": "Party crown",
    "col": "#FFC21F",
    "t": {
      "loot": 10,
      "old": 3,
      "tough": 1,
      "isle": 2,
      "weird": 5,
      "museum": 8
    },
    "eyes": [
      [
        46,
        74
      ],
      [
        74,
        74
      ],
      8
    ],
    "names": [
      "Queen Pointy",
      "Her Royal Shininess",
      "King Party"
    ],
    "brags": [
      "Rules the house. Literally a crown.",
      "Came from a cracker. Acts like a castle."
    ]
  },
  {
    "id": "duck",
    "nm": "Rubber duck",
    "col": "#FFD43B",
    "t": {
      "loot": 2,
      "old": 4,
      "tough": 2,
      "isle": 8,
      "weird": 7,
      "museum": 4
    },
    "eyes": [
      [
        70,
        40
      ],
      [
        84,
        42
      ],
      7
    ],
    "names": [
      "Quackson Pollock",
      "Admiral Squeak",
      "Sir Floatsalot"
    ],
    "brags": [
      "Undefeated in every bath since 2019.",
      "Squeaks once. Room goes silent."
    ]
  }
];
export const OBJI: Readonly<Record<string, GameObject>> = Object.fromEntries(OBJ.map(o => [o.id, o]));
