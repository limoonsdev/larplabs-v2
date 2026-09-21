import { createFileRoute } from "@tanstack/react-router";
import { Clause, LegalPage } from "@/components/legal";

export const Route = createFileRoute("/guidelines")({
  component: Guidelines,
});

function Guidelines() {
  return (
    <LegalPage
      title="Règles d'usage"
      updated="21 septembre 2026"
      intro="Ces règles protègent les cibles, les plateformes et la communauté. Les enfreindre expose à la suspension du compte et à la perte de l'abonnement sans remboursement."
    >
      <Clause n="1" title="Teste uniquement ce que tu possèdes">
        <p>Lance des workers uniquement vers tes propres sites, chaînes et contenus, ou avec une autorisation écrite et vérifiable du propriétaire. « C'est public » n'est pas une autorisation.</p>
      </Clause>
      <Clause n="2" title="Respecte les cibles">
        <p>Monte en charge progressivement, respecte les robots.txt et les limites publiées des plateformes, évite les pics brutaux, et ne fais jamais tourner de sessions contre des services critiques (santé, urgences, paiements).</p>
      </Clause>
      <Clause n="3" title="Contenus interdits">
        <p>Interdit : cibler des mineurs, du harcèlement, de la désinformation, du spam massif, du credential stuffing, du contournement de DRM ou toute activité illégale dans ta juridiction.</p>
      </Clause>
      <Clause n="4" title="Comptes & proxies tiers">
        <p>N'utilise pas les workers pour créer des faux comptes en masse, voter frauduleusement, gonfler artificiellement des classements contre les CGU des plateformes, ni pour exfiltrer des données non publiques.</p>
      </Clause>
      <Clause n="5" title="Automatisation loyale">
        <p>Le resolver Cloudflare/captcha et l'OCR sont fournis pour TES propres parcours de test. Les utiliser pour abuser d'un service tiers (squatter des drops, spammer des formulaires) est interdit.</p>
      </Clause>
      <Clause n="6" title="Signalement">
        <p>Un abus repéré ? Écris à support@larplabs-v2.com avec l'URL, la date et le maximum de détails. Les signalements fondés sont traités sous 72h.</p>
      </Clause>
    </LegalPage>
  );
}
