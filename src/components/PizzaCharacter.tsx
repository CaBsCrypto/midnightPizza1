// TODO: Replace with actual PizzaDAO mascot file

/**
 * PizzaCharacter — Molto Bene mascot overlay for Spicy Challenge
 * Renders as a fixed bottom-right corner overlay. Import and render once
 * at the App root level so it stays on top of all game UI.
 */
export function PizzaCharacter() {
  return (
    <div className="pizza-character">
      <img src="/pizza-character.png" alt="Molto Bene - PizzaDAO mascot" />
    </div>
  );
}

export default PizzaCharacter;
