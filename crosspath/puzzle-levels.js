// Copyright (C) 2026 Pelagic Games

(() => {
  window.CrosspathLevels = [
    {
      title: "Puzzle 1",
      difficulty: "very-easy",
      code: "T: 03a0006c0 aaa000aaa 03cc05505 3fa05003a fa9500900 000aaa000 050afa050 c003aa000 06caf9050 F: 6@2 8@5 3@6 4@7 2@8 5@9 X: N2 W2"
    },
    {
      title: "Puzzle 2",
      difficulty: "very-easy",
      code: "T: 0006ac503 5005003c0 06a050a90 5003ac003 050050a90 050690500 c00500fc0 3fc039000 06a050afa F: 9@2 7@3 8@6 5@7 4@8 3@9 X: -"
    },
    {
      title: "Puzzle 3",
      difficulty: "very-easy",
      code: "T: c00500506 05005003a 00006caf9 3c003c005 900000000 000000aaa 000000c00 3a90006aa 005005aa9 F: 7@3 4@6 2@8 X: W1 W7"
    },
    {
      title: "Puzzle 4",
      difficulty: "very-easy",
      code: "T: 500500900 0030006aa 5005003aa 3a9000000 6aa500906 000c00500 905005c05 c00500fac 000000aaa F: 6@4 7@6 3@7 X: -"
    },
    {
      title: "Puzzle 5",
      difficulty: "very-easy",
      code: "T: 5055053a9 00506f039 6aa900000 005005aa9 000aaa000 c005003ac 6c03fa050 05003cc05 000000006 F: 3@2 8@4 9@5 1@7 X: -"
    },
    {
      title: "Puzzle 6",
      difficulty: "very-easy",
      code: "T: 003000c00 06f6f9390 ac005003a c00500fc0 05003c003 500500900 5003ac005 3fc039c00 aaa00006a F: 7@4 2@7 X: N3 W3"
    },
    {
      title: "Puzzle 1",
      difficulty: "easy",
      code: "T: 000aac003 00300006a aaa000c00 3c005003a 690500500 005069a90 aac005005 000aaa000 5005063a9 F: 2@1 7@3 9@7 X: N3 E9"
    },
    {
      title: "Puzzle 2",
      difficulty: "easy",
      code: "T: 6aa900000 c003aa000 000c00500 0066a9900 505fa9500 003000000 aac003000 000006005 9000006ac F: 8@4 X: W3 S7"
    },
    {
      title: "Puzzle 3",
      difficulty: "easy",
      code: "T: aaa00006a 500500500 500900000 006069050 aac005aa9 000ac0050 05003a000 06a690500 a90000000 F: 1@2 7@5 6@6 9@9 X: -"
    },
    {
      title: "Puzzle 4",
      difficulty: "easy",
      code: "T: 03c005069 03a000000 050690900 6c03fa050 c003aa000 06caf9050 afc039000 000ac003a 050afa050 F: 9@2 6@3 1@6 X: -"
    },
    {
      title: "Puzzle 5",
      difficulty: "easy",
      code: "T: 5005063a9 aaa000000 000ac0050 c003ac005 503900000 5055053a9 0000066a9 c05505505 aaa0006ac F: - X: W1 S5"
    },
    {
      title: "Puzzle 6",
      difficulty: "easy",
      code: "T: c00500900 6aa90006a 000ac003a 000000c00 6905063a9 aac005003 06aa90000 005005aa9 5003ac005 F: 7@1 X: W2 W5"
    },
    {
      title: "Puzzle 1",
      difficulty: "medium",
      code: "T: 005003ac0 6af5053a9 06caf9050 005005005 03a000000 6c03fc03f aa9000000 ac003a000 000aac005 F: - X: N6 S8"
    },
    {
      title: "Puzzle 2",
      difficulty: "medium",
      code: "T: 500500500 5005003aa 06a050a90 005069a90 050050afc aac005069 039000000 005c05503 00006c03f F: 5@6 7@9 X: -"
    },
    {
      title: "Puzzle 3",
      difficulty: "medium",
      code: "T: c005003aa 050afa050 6fa390000 050afc039 c005003c0 6aa5003c0 500500500 005005aa9 3c005003c F: 9@6 X: -"
    },
    {
      title: "Puzzle 4",
      difficulty: "medium",
      code: "T: 003000000 c003aa000 000aac005 005069050 06a050afc 050afc039 005005003 aac005005 039000000 F: - X: N3 W5"
    },
    {
      title: "Puzzle 5",
      difficulty: "medium",
      code: "T: 0506fa390 6aa900000 aa9000000 ac003c005 fc0390000 000000006 906005069 069690500 006069690 F: 4@2 X: -"
    },
    {
      title: "Puzzle 6",
      difficulty: "medium",
      code: "T: 050a90006 0006ac503 5003c0050 6905063a9 aac005069 000ac003a 069050a90 005003000 3aa000aac F: 4@7 X: -"
    },
    {
      title: "Puzzle 1",
      difficulty: "hard",
      code: "T: 000000c06 5003aa000 500500500 000ac0050 aac0056a9 6faf90500 fc0390000 505503500 0066a9900 F: 5@3 X: -"
    },
    {
      title: "Puzzle 2",
      difficulty: "hard",
      code: "T: 005005aa9 aac0056a9 005005005 6aa500500 500fac503 500500500 05003a000 5003c0050 000006005 F: 9@3 X: -"
    },
    {
      title: "Puzzle 3",
      difficulty: "hard",
      code: "T: 006003000 aa9000000 006005aa9 aac005005 ac003ac00 005005005 5005003aa c06fa9500 500900000 F: - X: -"
    },
    {
      title: "Puzzle 4",
      difficulty: "hard",
      code: "T: 5003ac005 a900066a9 6aa500fc0 39000606f 0000006aa 6a95003aa 005005aa9 500fac905 039000aaa F: - X: -"
    },
    {
      title: "Puzzle 5",
      difficulty: "hard",
      code: "T: aac00506f 039000aac 5003ac005 aaf005003 a90000aaa 03900006a 050050afc 6aa500500 005005aa9 F: - X: -"
    },
    {
      title: "Puzzle 6",
      difficulty: "hard",
      code: "T: fc0390006 aa9000000 005005003 006069050 ac0050050 6ac505503 05005003c 6fa390000 006069a90 F: 4@1 X: -"
    },
    {
      title: "Puzzle 1",
      difficulty: "very-hard",
      code: "T: c05faf505 00006aa90 fa95003aa 0056a9900 6af503500 aac005005 000ac003c 3aa000000 000000006 F: - X: -"
    },
    {
      title: "Puzzle 2",
      difficulty: "very-hard",
      code: "T: 500500500 500500900 03a000ac0 aac0056a9 0000006ac 050050050 5035003aa a90000aaa c003ac003 F: - X: -"
    },
    {
      title: "Puzzle 3",
      difficulty: "very-hard",
      code: "T: 503900000 5003c003a 6ac905069 afc039000 000006c05 06a690500 c003aa000 050afa050 00006a050 F: - X: -"
    },
    {
      title: "Puzzle 4",
      difficulty: "very-hard",
      code: "T: 06caf9050 05003a000 050050a90 050050afa 6f9390000 000006005 500906069 00500506f 000aaa000 F: - X: -"
    },
    {
      title: "Puzzle 5",
      difficulty: "very-hard",
      code: "T: 000000aac 005005005 aa9000000 003c003ac 03c003000 c003aa000 6ac5033c0 000c003aa 000c003ac F: - X: -"
    },
    {
      title: "Puzzle 6",
      difficulty: "very-hard",
      code: "T: 500900000 000c003aa 000ac003a 000000c00 5005063a9 0006aa500 050050690 6ac5033c0 900000000 F: - X: -"
    }
  ];
})();
