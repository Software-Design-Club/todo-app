import List from "../_components/list";

const ListPage = async ({ params }: { params: { listId: string } }) => {
  const { listId } = params;

  return <div>{listId && <List listId={Number(listId)} />}</div>;
};

export default ListPage;
