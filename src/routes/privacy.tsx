import { createFileRoute } from "@tanstack/react-router";
import { Clause, LegalPage } from "@/components/legal";

export const Route = createFileRoute("/privacy")({
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      updated="21 septembre 2026"
      intro="Ce document explique quelles données LarpLabs V2 collecte, pourquoi, et quels sont tes droits. Principe de base : le minimum utile, jamais revendu."
    >
      <Clause n="1" title="Données collectées">
        <p>Compte : email, hash de mot de passe (jamais en clair), plan et dates. Usage : URLs testées, configurations de sessions, presets sauvegardés, logs techniques de workers. Les proxies proviennent de listes publiques et ne sont pas liés à ton identité.</p>
      </Clause>
      <Clause n="2" title="Paiements (LarpPay Services)">
        <p>Les paiements sont traités par LarpPay Services. LarpLabs V2 ne reçoit ni ne stocke les numéros de carte complets : seuls les 4 derniers chiffres, le réseau (Visa, Mastercard, Amex, CB) et le titulaire sont conservés pour la facturation.</p>
      </Clause>
      <Clause n="3" title="Cookies & stockage local">
        <p>Le site utilise le stockage local du navigateur (jeton de session, préférences) et aucun traceur publicitaire. Les jetons expirent après 30 jours d'inactivité.</p>
      </Clause>
      <Clause n="4" title="IA (LarpBot)">
        <p>Les messages envoyés à LarpBot transitent par notre fournisseur d'IA pour générer la réponse et, sur demande, ton preset. Ils ne sont ni revendus ni utilisés pour entraîner des modèles publicitaires.</p>
      </Clause>
      <Clause n="5" title="Partage">
        <p>Aucune vente de données. Sous-traitants strictement nécessaires : hébergeur VPS, LarpPay Services (paiement), fournisseur d'IA (inférence). Transmission aux autorités uniquement sur obligation légale.</p>
      </Clause>
      <Clause n="6" title="Conservation">
        <p>Compte et presets : conservés tant que le compte existe. Logs de sessions : 30 jours glissants. Après suppression du compte, les données personnelles sont effacées sous 30 jours (hors obligations comptables : factures LarpPay, 10 ans).</p>
      </Clause>
      <Clause n="7" title="Tes droits">
        <p>Accès, rectification, suppression, portabilité et opposition : écris à support@larplabs-v2.com depuis ton email de compte. Réponse sous 30 jours.</p>
      </Clause>
    </LegalPage>
  );
}
