// GameController provides the game lifecycle (init, run loop) and wires
// the modular systems together. The core orchestration class is `Game`
// in game.js, which delegates to WorldViewSystem, PlayerMovementSystem,
// CombatSystem, and MonsterFactory.

window.addEventListener('load', () => {
    const game = new Game();
    window.game = game;
    game.run();
});
