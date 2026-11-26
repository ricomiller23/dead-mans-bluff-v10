const RANKS = ['9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VAL = { '9': 0, '10': 1, 'J': 2, 'Q': 3, 'K': 4, 'A': 5 };

function isHigherBet(newBet, currentBet) {
  if (!currentBet) return true;
  if (newBet.count > currentBet.count) return true;
  if (newBet.count === currentBet.count && RANK_VAL[newBet.rank] > RANK_VAL[currentBet.rank]) return true;
  return false;
}

function getLegalRaises(currentBet, totalCardsInPlay) {
  const raises = [];
  const maxCount = Math.min(4, totalCardsInPlay);
  for (let c = 1; c <= maxCount; c++) {
    for (const r of RANKS) {
      const candidate = { count: c, rank: r };
      if (isHigherBet(candidate, currentBet)) {
        raises.push(candidate);
      }
    }
  }
  return raises;
}

// Combinations nCr
function nCr(n, r) {
  if (r < 0 || r > n) return 0;
  if (r === 0 || r === n) return 1;
  let c = 1;
  for (let i = 1; i <= r; i++) {
    c = (c * (n - (i - 1))) / i;
  }
  return c;
}

// Hypergeometric prob that at least needed cards exist in unseen other active hands
function probAtLeast(needed, kInHand, handSize, totalOthersCards) {
  if (needed <= 0) return 1.0;
  const remainingInDeckPool = 24 - handSize;
  const targetCardsInPool = 4 - kInHand;
  if (targetCardsInPool < needed) return 0.0;
  if (totalOthersCards < needed) return 0.0;

  const totalCombs = nCr(remainingInDeckPool, totalOthersCards);
  if (totalCombs <= 0) return 0.0;

  let prob = 0;
  const maxPossible = Math.min(targetCardsInPool, totalOthersCards);
  for (let x = needed; x <= maxPossible; x++) {
    const favorable = nCr(targetCardsInPool, x) * nCr(remainingInDeckPool - targetCardsInPool, totalOthersCards - x);
    prob += favorable / totalCombs;
  }
  return Math.min(1.0, Math.max(0.0, prob));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeck() {
  const deck = [];
  for (const r of RANKS) {
    for (let i = 0; i < 4; i++) deck.push(r);
  }
  return shuffle(deck);
}

class GameSimulator {
  constructor() {
    this.players = [
      { id: 0, name: 'Mara', persona: 'mathematician', maxCards: 5, cards: [], bluffsCaught: 0, truthfulBets: 0, callsMade: 0, callsCorrect: 0, stung: false },
      { id: 1, name: 'Duke', persona: 'hot_lead', maxCards: 5, cards: [], bluffsCaught: 0, truthfulBets: 0, callsMade: 0, callsCorrect: 0, stung: false },
      { id: 2, name: 'Silas', persona: 'undertaker', maxCards: 5, cards: [], bluffsCaught: 0, truthfulBets: 0, callsMade: 0, callsCorrect: 0, stung: false },
      { id: 3, name: 'Doc', persona: 'mathematician', maxCards: 5, cards: [], bluffsCaught: 0, truthfulBets: 0, callsMade: 0, callsCorrect: 0, stung: false },
    ];
    this.starterIdx = 0;
  }

  getActivePlayers() {
    return this.players.filter(p => p.maxCards > 0);
  }

  getTotalCardsInPlay() {
    return this.getActivePlayers().reduce((sum, p) => sum + p.maxCards, 0);
  }

  // AI Decision logic
  makeDecision(player, currentBet, betHistory) {
    const totalInPlay = this.getTotalCardsInPlay();
    const legalRaises = getLegalRaises(currentBet, totalInPlay);
    
    // If no legal raises possible, must call liar
    if (!currentBet) {
      // Opening bet must be made
      return { action: 'raise', bet: this.chooseOpeningBet(player, legalRaises) };
    }
    
    if (legalRaises.length === 0) {
      return { action: 'call' };
    }

    // Evaluate current bet probability
    const kInHand = player.cards.filter(r => r === currentBet.rank).length;
    const needed = currentBet.count - kInHand;
    const othersCards = totalInPlay - player.cards.length;
    const prob = probAtLeast(needed, kInHand, player.cards.length, othersCards);

    // Call thresholds by persona
    let callThreshold = 0.35;
    if (player.persona === 'mathematician') {
      callThreshold = 0.33;
    } else if (player.persona === 'hot_lead') {
      callThreshold = player.stung ? 0.50 : 0.25; // if stung, calls much more aggressively
    } else if (player.persona === 'undertaker') {
      // Silas waits for key moment or low prob
      callThreshold = totalInPlay <= 8 ? 0.40 : 0.28;
    }

    // If bettor has high bluff rate observed, increase call probability
    const bettor = this.players[currentBet.bettorId];
    if (bettor) {
      const totalBettorBets = bettor.bluffsCaught + bettor.truthfulBets;
      if (totalBettorBets >= 2) {
        const bluffRate = bettor.bluffsCaught / totalBettorBets;
        if (bluffRate > 0.5) callThreshold += 0.12;
      }
    }

    // Decision: Call or Raise
    const shouldCall = (prob < callThreshold) || (needed > (4 - kInHand));
    if (shouldCall && Math.random() < 0.92) {
      return { action: 'call' };
    }

    // Otherwise choose a raise
    const chosenRaise = this.chooseRaise(player, legalRaises, currentBet, totalInPlay);
    return { action: 'raise', bet: chosenRaise };
  }

  chooseOpeningBet(player, legalRaises) {
    // Counts of ranks in hand
    const counts = {};
    for (const r of RANKS) counts[r] = 0;
    for (const r of player.cards) counts[r]++;

    // Best rank in hand
    let bestRank = RANKS[RANKS.length - 1];
    let maxC = -1;
    for (const r of RANKS) {
      if (counts[r] >= maxC) {
        maxC = counts[r];
        bestRank = r;
      }
    }

    if (player.persona === 'hot_lead' && Math.random() < 0.35) {
      // Hot lead bluffs opening bet with count 2
      const cand = legalRaises.find(b => b.count === 2 && b.rank === 'A');
      if (cand) return cand;
    }

    // Default opening: count 1 of best rank or count 1 of 10/J
    const openCand = legalRaises.find(b => b.count === 1 && b.rank === bestRank) || legalRaises[0];
    return openCand;
  }

  chooseRaise(player, legalRaises, currentBet, totalInPlay) {
    const counts = {};
    for (const r of RANKS) counts[r] = 0;
    for (const r of player.cards) counts[r]++;

    // Score legal raises based on persona
    if (player.persona === 'hot_lead' && Math.random() < 0.45) {
      // Jump count bluff
      const higherCountRaises = legalRaises.filter(b => b.count > currentBet.count);
      if (higherCountRaises.length > 0) {
        // pick a jump bet
        return higherCountRaises[Math.floor(Math.random() * higherCountRaises.length)];
      }
    }

    // Find raises that match hand cards
    const truthRaises = legalRaises.filter(b => {
      const inHand = counts[b.rank];
      const needed = b.count - inHand;
      const othersCards = totalInPlay - player.cards.length;
      return probAtLeast(needed, inHand, player.cards.length, othersCards) >= 0.30;
    });

    if (truthRaises.length > 0) {
      // Pick smallest increment truth raise
      return truthRaises[0];
    }

    // Silas critical bluff
    if (player.persona === 'undertaker' && Math.random() < 0.25) {
      const bluffs = legalRaises.filter(b => b.count === currentBet.count + 1);
      if (bluffs.length > 0) return bluffs[bluffs.length - 1]; // big bluff
    }

    // Smallest legal raise fallback
    return legalRaises[0];
  }

  runRound() {
    const active = this.getActivePlayers();
    if (active.length <= 1) return false;

    // Deal cards
    const deck = buildDeck();
    for (const p of active) {
      p.cards = deck.splice(0, p.maxCards);
    }

    let currentBet = null;
    let turnIdx = this.starterIdx % active.length;
    let betHistory = [];

    while (true) {
      const player = active[turnIdx];
      const decision = this.makeDecision(player, currentBet, betHistory);

      if (decision.action === 'call') {
        // CALL LIAR!
        const bettor = this.players[currentBet.bettorId];
        const caller = player;

        // Count rank across ALL active hands
        let actualCount = 0;
        for (const p of active) {
          for (const r of p.cards) {
            if (r === currentBet.rank) actualCount++;
          }
        }

        const betIsTrue = actualCount >= currentBet.count;
        let roundLoser;

        caller.callsMade++;
        if (betIsTrue) {
          // Bet was true, caller loses 2 cards
          caller.stung = true;
          bettor.stung = false;
          bettor.truthfulBets++;
          const lost = Math.min(2, caller.maxCards);
          caller.maxCards -= lost;
          roundLoser = caller;
        } else {
          // Bet was false (bluff caught!), bettor loses 2 cards
          bettor.stung = true;
          caller.stung = false;
          caller.callsCorrect++;
          bettor.bluffsCaught++;
          const lost = Math.min(2, bettor.maxCards);
          bettor.maxCards -= lost;
          roundLoser = bettor;
        }

        // Set next starter: loser if still active, else next active clockwise from loser
        const remainingActive = this.getActivePlayers();
        if (remainingActive.length <= 1) {
          return true; // Game over
        }

        if (roundLoser.maxCards > 0) {
          this.starterIdx = remainingActive.indexOf(roundLoser);
        } else {
          // Loser eliminated, find next clockwise active player
          const loserOrigIdx = this.players.indexOf(roundLoser);
          let nextIdx = (loserOrigIdx + 1) % this.players.length;
          while (this.players[nextIdx].maxCards <= 0) {
            nextIdx = (nextIdx + 1) % this.players.length;
          }
          this.starterIdx = remainingActive.indexOf(this.players[nextIdx]);
        }
        return true;
      } else {
        // Raise
        const newBet = decision.bet;
        // Strict verification
        if (!isHigherBet(newBet, currentBet)) {
          throw new Error(`ILLEGAL RAISE! Prev: ${JSON.stringify(currentBet)}, New: ${JSON.stringify(newBet)}`);
        }
        if (newBet.count > 4) {
          throw new Error(`BET EXCEEDED 4! Bet: ${JSON.stringify(newBet)}`);
        }
        if (newBet.count > this.getTotalCardsInPlay()) {
          throw new Error(`BET EXCEEDED IN-PLAY CARDS! Bet: ${JSON.stringify(newBet)}, in play: ${this.getTotalCardsInPlay()}`);
        }

        currentBet = { count: newBet.count, rank: newBet.rank, bettorId: player.id };
        betHistory.push({ player: player.name, bet: currentBet });
        turnIdx = (turnIdx + 1) % active.length;
      }
    }
  }

  playGame() {
    let rounds = 0;
    while (this.getActivePlayers().length > 1) {
      rounds++;
      if (rounds > 100) {
        throw new Error(`Game exceeded 100 rounds! Infinite loop suspected.`);
      }
      this.runRound();
    }
    return { winner: this.getActivePlayers()[0], rounds };
  }
}

console.log("Starting 200 simulation test games...");
let totalRounds = 0;
const wins = {};
for (let g = 0; g < 200; g++) {
  const sim = new GameSimulator();
  const res = sim.playGame();
  wins[res.winner.name] = (wins[res.winner.name] || 0) + 1;
  totalRounds += res.rounds;
}
console.log(`Successfully completed 200 games!`);
console.log(`Average rounds per game: ${(totalRounds / 200).toFixed(1)}`);
console.log(`Win distribution:`, wins);
