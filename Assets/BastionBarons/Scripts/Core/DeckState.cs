using System.Collections.Generic;

namespace BastionBarons.Core
{
    /// <summary>Ciclo de cartas em partida: mão visível + fila. Carta jogada volta para o fim da fila.</summary>
    public class DeckState
    {
        public readonly List<string> Hand = new List<string>();
        readonly Queue<string> queue = new Queue<string>();

        public DeckState(IList<string> deck, int handSize, Rng rng)
        {
            var list = new List<string>(deck);
            rng.Shuffle(list);
            for (int i = 0; i < list.Count; i++)
            {
                if (i < handSize) Hand.Add(list[i]);
                else queue.Enqueue(list[i]);
            }
        }

        public string Next { get { return queue.Count > 0 ? queue.Peek() : null; } }
        public IEnumerable<string> Pending { get { return queue; } }

        public string Play(int handIndex)
        {
            string id = Hand[handIndex];
            if (queue.Count > 0)
            {
                Hand[handIndex] = queue.Dequeue();
                queue.Enqueue(id);
            }
            return id;
        }
    }
}
