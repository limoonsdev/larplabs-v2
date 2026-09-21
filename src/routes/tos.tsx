import { createFileRoute } from "@tanstack/react-router";
import { Clause, LegalPage } from "@/components/legal";

export const Route = createFileRoute("/tos")({
  component: Tos,
});

function Tos() {
  return (
    <LegalPage
      title="Conditions Générales d'Utilisation"
      updated="21 septembre 2026"
      intro="Les présentes CGU encadrent l'utilisation de LarpLabs V2 (workers Chrome, proxies, presets, LarpBot) et des paiements traités par LarpPay Services. En créant un compte, tu les acceptes."
    >
      <Clause n="1" title="Service">
        <p>LarpLabs V2 fournit une plateforme d'orchestration de navigateurs Chrome automatisés : sessions multi-workers, rotation de proxies publics, presets par plateforme, resolver de challenges et assistant LarpBot.</p>
      </Clause>
      <Clause n="2" title="Compte">
        <p>L'accès au panel exige un compte (email + mot de passe). Tu es responsable de la confidentialité de tes identifiants. L'inscription attribue le plan Starter gratuit.</p>
      </Clause>
      <Clause n="3" title="Utilisation acceptable">
        <p>Tu t'engages à ne diriger des workers que vers des sites que tu possèdes ou pour lesquels tu disposes d'une autorisation écrite de test de charge. Tout usage contre des tiers non consentants est interdit et entraîne la suspension immédiate du compte.</p>
      </Clause>
      <Clause n="4" title="Abonnements & LarpPay Services">
        <p>Les plans payants (Pro, Max) sont facturés mensuellement via LarpPay Services. Les quotas (workers simultanés) sont appliqués automatiquement. LarpLabs V2 ne stocke jamais les numéros de carte complets : seuls les 4 derniers chiffres et le réseau transitent.</p>
      </Clause>
      <Clause n="5" title="Remboursements">
        <p>Remboursement intégral sous 7 jours après le premier paiement, sur simple demande à support@larplabs-v2.com. Passé ce délai, les mois entamés restent dus.</p>
      </Clause>
      <Clause n="6" title="Fair use">
        <p>Les quotas de ton plan s'appliquent par session et au total. Tout contournement (multi-comptes, partage massif de session) peut entraîner une limitation ou une résiliation.</p>
      </Clause>
      <Clause n="7" title="Résiliation">
        <p>Tu peux supprimer ton compte à tout moment (le plan actif court jusqu'à la fin du mois payé). Nous pouvons suspendre tout compte en violation des présentes, sans préavis en cas d'abus grave.</p>
      </Clause>
      <Clause n="8" title="Responsabilité">
        <p>Le service est fourni « en l'état ». LarpLabs V2 ne saurait être tenu responsable des dommages indirects liés à l'usage des workers, des proxies tiers ou des contenus des sites visités.</p>
      </Clause>
      <Clause n="9" title="Contact">
        <p>Questions : support@larplabs-v2.com. Les litiges relèvent des juridictions compétentes du siège de l'éditeur.</p>
      </Clause>
    </LegalPage>
  );
}
