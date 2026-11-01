using System.Collections.Generic;

namespace BastionBarons.Core
{
    /// <summary>Gerador determinístico (xorshift32). Mesma semente => mesma partida, no cliente e no servidor.</summary>
    public class Rng
    {
        uint state;

        public Rng(int seed)
        {
            state = unchecked((uint)seed ^ 0x9E3779B9u);
            if (state == 0) state = 0x6C078965u;
        }

        public uint NextUInt()
        {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            return state;
        }

        /// <summary>[0,1)</summary>
        public float NextFloat() { return (NextUInt() >> 8) * (1f / 16777216f); }

        public int Range(int min, int maxExclusive)
        {
            if (maxExclusive <= min) return min;
            return min + (int)(NextUInt() % (uint)(maxExclusive - min));
        }

        public void Shuffle<T>(IList<T> list)
        {
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = Range(0, i + 1);
                T t = list[i]; list[i] = list[j]; list[j] = t;
            }
        }
    }
}
