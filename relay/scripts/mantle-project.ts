// DEPLOY ONLY. The lead runs this with the deployment identity, never the relay role.
// Configures a workspace; makes no inference calls and sends no images.
import { pathToFileURL } from 'node:url';
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';

interface Project { id: string; arn: string; data_retention?: { mode: string } }
type AdminClient = Pick<AnthropicBedrockMantle, 'get' | 'post'>;

export async function prepareProject(client: AdminClient, existing?: string): Promise<Project> {
  const project = existing
    ? await client.get<Project>(`/v1/organization/projects/${existing}`)
    : await client.post<Project>('/v1/organization/projects', {
      body: { name: 'Snag & Brag', tags: { Application: 'SnagAndBrag' }, data_retention: { mode: 'none' } },
    });
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(project.id) || project.id.trim() !== project.id || !project.arn.startsWith('arn:aws:bedrock-mantle:') || !project.arn.endsWith(`:project/${project.id}`)) throw new Error('Invalid workspace response');
  await client.post(`/v1/organization/projects/${project.id}`, { body: { data_retention: { mode: 'none' } } });
  const verified = await client.get<Project>(`/v1/organization/projects/${project.id}`);
  if (verified.id !== project.id || verified.arn !== project.arn || verified.data_retention?.mode !== 'none') throw new Error('Workspace retention was not verified');
  return verified;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const region = process.env.AWS_REGION;
    if (!region || !/^[a-z]{2}-[a-z]+-\d$/.test(region)) throw new Error('Region required');
    const client = new AnthropicBedrockMantle({ awsRegion: region, baseURL: `https://bedrock-mantle.${region}.api.aws`, maxRetries: 0, timeout: 10000, logLevel: 'off' });
    const project = await prepareProject(client, process.env.BEDROCK_WORKSPACE_ID);
    // Configuration identifiers only, never credentials or the full API response.
    process.stdout.write(`${project.id}\t${project.arn}\n`);
  } catch {
    process.stderr.write('Mantle workspace setup failed. Check deployment permissions/region; private response suppressed.\n');
    process.exitCode = 1;
  }
}
